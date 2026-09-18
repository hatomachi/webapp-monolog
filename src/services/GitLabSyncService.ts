import { MonologEntry, StorageConfig } from '../types';
import { StorageService } from './StorageService';
import {
  buildMarkdownForDate,
  encodeUtf8Base64,
  resolveFilePath,
} from './markdownFormatter';

export interface GitLabProjectMetadata {
  id: string;
  defaultBranch: string;
  emptyRepo: boolean;
  name: string;
  pathWithNamespace: string;
}

export class GitLabSyncService {
  private static metadataCache = new Map<string, GitLabProjectMetadata>();

  /**
   * Resolve GitLab API base URL (例: https://gitlab.example.com/api/v4)
   */
  public static getApiBase(config: StorageConfig): string {
    let base = (config.baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) {
      base = 'https://gitlab.com';
    }
    if (!base.endsWith('/api/v4')) {
      base = `${base}/api/v4`;
    }
    return base;
  }

  /**
   * Resolve GitLab project identifier (numeric ID or URL-encoded path like "group%2Fproject")
   */
  public static getProjectId(config: StorageConfig): string {
    const owner = (config.owner || '').trim();
    const repo = (config.repo || '').trim();

    if (!owner) {
      return encodeURIComponent(repo.replace(/^\/+|\/+$/g, ''));
    }
    const fullPath = `${owner}/${repo}`.replace(/^\/+|\/+$/g, '');
    return encodeURIComponent(fullPath);
  }

  /**
   * Helper to perform GitLab API requests with PRIVATE-TOKEN & Bearer headers
   */
  public static async apiFetch(
    config: StorageConfig,
    endpoint: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const base = this.getApiBase(config);
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = new Headers(init.headers || {});
    if (config.token) {
      headers.set('PRIVATE-TOKEN', config.token.trim());
      headers.set('Authorization', `Bearer ${config.token.trim()}`);
    }

    return fetch(url, {
      ...init,
      headers,
    });
  }

  /**
   * プロジェクトメタデータ取得（キャッシュ付き）
   */
  public static async getProjectMetadata(config: StorageConfig): Promise<GitLabProjectMetadata> {
    const cacheKey = `gitlab_meta_${config.baseUrl || 'gitlab'}_${config.owner}_${config.repo}`;
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey)!;
    }

    const rawPath = this.getProjectId(config);
    const res = await this.apiFetch(config, `/projects/${rawPath}`);
    if (!res.ok) {
      let errMsg = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.message) {
          errMsg += ` - ${typeof errJson.message === 'string' ? errJson.message : JSON.stringify(errJson.message)}`;
        }
      } catch {}
      throw new Error(`GitLabプロジェクト "${rawPath}" の取得に失敗しました: ${errMsg}`);
    }

    const data = await res.json();
    const meta: GitLabProjectMetadata = {
      id: String(data.id),
      defaultBranch: data.default_branch || 'master',
      emptyRepo: Boolean(data.empty_repo),
      name: data.name || '',
      pathWithNamespace: data.path_with_namespace || data.name || config.repo,
    };

    this.metadataCache.set(cacheKey, meta);
    return meta;
  }

  /**
   * 接続テスト（webapp-obsidian同様にtreeエンドポイントでブランチ自動検出）
   */
  public static async testConnection(
    config: StorageConfig
  ): Promise<{ success: boolean; message: string; username?: string; detectedBranch?: string }> {
    if (!config.token || !config.repo) {
      return { success: false, message: 'Token と プロジェクト名 (Repo) が未入力です' };
    }

    try {
      // 1. ユーザー情報取得 (PAT検証)
      let username = '';
      try {
        const userRes = await this.apiFetch(config, '/user');
        if (userRes.ok) {
          const userData = await userRes.json();
          username = userData.username || userData.name || '';
        }
      } catch (userErr) {
        console.warn('GitLab /user fetch failed:', userErr);
      }

      // 2. プロジェクト情報取得
      const meta = await this.getProjectMetadata(config);

      if (meta.emptyRepo) {
        return {
          success: false,
          message: `プロジェクト「${meta.pathWithNamespace}」は接続成功しましたが、空のリポジトリ（コミットなし）です。初期コミットを作成してください。`,
          username,
        };
      }

      // 3. リポジトリアクセステスト（candidateBranches: 指定ブランチ -> defaultBranch -> master -> main）
      const candidateBranches: string[] = [];
      if (config.branch && config.branch.trim()) {
        candidateBranches.push(config.branch.trim());
      }
      if (meta.defaultBranch && !candidateBranches.includes(meta.defaultBranch)) {
        candidateBranches.push(meta.defaultBranch);
      }
      if (!candidateBranches.includes('master')) candidateBranches.push('master');
      if (!candidateBranches.includes('main')) candidateBranches.push('main');

      let treeSuccess = false;
      let successfulBranch = '';
      let lastError = '';

      for (const b of candidateBranches) {
        const testRes = await this.apiFetch(
          config,
          `/projects/${meta.id}/repository/tree?ref=${encodeURIComponent(b)}&per_page=1`
        );
        if (testRes.ok) {
          treeSuccess = true;
          successfulBranch = b;
          break;
        } else {
          try {
            const errData = await testRes.json();
            lastError = errData.message || `${testRes.status} ${testRes.statusText}`;
          } catch {
            lastError = `${testRes.status} ${testRes.statusText}`;
          }
        }
      }

      // ブランチ指定で失敗した場合はref指定なしでデフォルトブランチ取得を試行
      if (!treeSuccess) {
        const testNoRefRes = await this.apiFetch(
          config,
          `/projects/${meta.id}/repository/tree?per_page=1`
        );
        if (testNoRefRes.ok) {
          treeSuccess = true;
          successfulBranch = meta.defaultBranch || 'master';
        }
      }

      if (!treeSuccess) {
        return {
          success: false,
          message: `プロジェクトは見つかりましたが、リポジトリへのアクセスでエラーになりました (${lastError})。PATに「read_repository」または「api」権限があるか、ブランチ名をご確認ください。`,
          username,
        };
      }

      let branchNotice = `ブランチ: ${successfulBranch}`;
      if (config.branch && config.branch.trim() !== successfulBranch) {
        branchNotice += ` (指定の "${config.branch}" が無いため自動切替)`;
      }

      const userPart = username ? `ユーザー: ${username}` : 'トークン有効';

      return {
        success: true,
        message: `接続成功: ${meta.pathWithNamespace} [ID: ${meta.id}] (${userPart} / ${branchNotice})`,
        username,
        detectedBranch: successfulBranch,
      };
    } catch (e: any) {
      console.error('GitLab test connection failed:', e);
      return {
        success: false,
        message: e.message || 'GitLab接続に失敗しました。Base URLやトークン、プロジェクト名を確認してください。',
      };
    }
  }

  /**
   * 未同期エントリをバックグラウンドでGitLabに同期
   */
  public static async syncPendingEntries(
    config: StorageConfig
  ): Promise<{ syncedCount: number; errors: string[] }> {
    if (!config.token || !config.repo) {
      return { syncedCount: 0, errors: ['GitLab設定が未完了です'] };
    }

    let syncedCount = 0;
    const errors: string[] = [];

    try {
      const pending = await StorageService.getPendingEntries();
      if (pending.length === 0) {
        return { syncedCount: 0, errors: [] };
      }

      // プロジェクトメタデータ取得
      const meta = await this.getProjectMetadata(config);
      const projectId = meta.id;

      // 使用ブランチの決定（指定ブランチ -> defaultBranch -> master）
      let targetBranch = (config.branch || '').trim() || meta.defaultBranch || 'master';

      // 日付（dateStr: YYYY-MM-DD）ごとにエントリをグループ化
      const byDate = new Map<string, MonologEntry[]>();
      pending.forEach((entry) => {
        const list = byDate.get(entry.dateStr) || [];
        list.push(entry);
        byDate.set(entry.dateStr, list);
      });

      for (const [dateStr, entries] of byDate.entries()) {
        try {
          const filePath = resolveFilePath(config.basePath, dateStr);
          const encodedFilePath = encodeURIComponent(filePath);

          // 1. 既存ファイルを取得（指定ブランチ -> defaultBranch）
          let existingContent = '';
          let fileExists = false;
          let workingBranch = targetBranch;

          const candidateBranches = [targetBranch];
          if (meta.defaultBranch && !candidateBranches.includes(meta.defaultBranch)) {
            candidateBranches.push(meta.defaultBranch);
          }

          for (const b of candidateBranches) {
            try {
              const getRes = await this.apiFetch(
                config,
                `/projects/${projectId}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(b)}`
              );

              if (getRes.ok) {
                existingContent = await getRes.text();
                fileExists = true;
                workingBranch = b;
                break;
              } else if (getRes.status === 404) {
                // ファイルが存在しない（新規ノート）
                workingBranch = b;
              }
            } catch (fetchErr) {
              console.warn(`[GitLabSync] Failed to fetch file on branch "${b}":`, fetchErr);
            }
          }

          // 2. 新規エントリを追記
          const { updatedContent, successfullyAppendedEntries } = buildMarkdownForDate(
            dateStr,
            existingContent,
            entries
          );

          if (successfullyAppendedEntries.length === 0) {
            continue;
          }

          // コミットメッセージ
          const times = successfullyAppendedEntries.map((e) => e.timeStr.slice(0, 5)).join(', ');
          const commitMsg = `feat(monolog): ${dateStr} [${times}]`;

          // 3. GitLab Commits API で作成または更新
          const base64Content = encodeUtf8Base64(updatedContent);
          let action: 'create' | 'update' = fileExists ? 'update' : 'create';

          const buildPayload = (act: 'create' | 'update', branchToUse: string) => ({
            branch: branchToUse,
            commit_message: commitMsg,
            actions: [
              {
                action: act,
                file_path: filePath,
                content: base64Content,
                encoding: 'base64',
              },
            ],
          });

          let commitRes = await this.apiFetch(config, `/projects/${projectId}/repository/commits`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildPayload(action, workingBranch)),
          });

          // 指定ブランチが存在しない等で失敗した場合、defaultBranch で再試行
          if (!commitRes.ok && workingBranch !== meta.defaultBranch && meta.defaultBranch) {
            console.warn(
              `[GitLabSync] Commit failed on "${workingBranch}". Retrying with default branch "${meta.defaultBranch}"...`
            );
            const defBranchRes = await this.apiFetch(config, `/projects/${projectId}/repository/commits`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(buildPayload(action, meta.defaultBranch)),
            });

            if (defBranchRes.ok) {
              commitRes = defBranchRes;
              workingBranch = meta.defaultBranch;
            }
          }

          // action (create / update) の不一致時の自動フォールバック
          if (!commitRes.ok) {
            const fallbackAction: 'create' | 'update' = action === 'create' ? 'update' : 'create';
            const retryRes = await this.apiFetch(config, `/projects/${projectId}/repository/commits`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(buildPayload(fallbackAction, workingBranch)),
            });

            if (retryRes.ok) {
              commitRes = retryRes;
            }
          }

          if (!commitRes.ok) {
            let errDetail = `${commitRes.status} ${commitRes.statusText}`;
            try {
              const errJson = await commitRes.json();
              if (errJson.message) {
                errDetail += ` - ${typeof errJson.message === 'string' ? errJson.message : JSON.stringify(errJson.message)}`;
              }
            } catch {}
            throw new Error(`GitLabコミット保存に失敗しました: ${errDetail}`);
          }

          // ブランチが自動切替された場合は設定も更新
          if (workingBranch && workingBranch !== config.branch) {
            const updatedConfig = { ...config, branch: workingBranch };
            StorageService.saveConfig(updatedConfig);
          }

          // 4. ローカルステータスを同期済みに更新
          const nowIso = new Date().toISOString();
          for (const entry of successfullyAppendedEntries) {
            await StorageService.updateEntry({
              ...entry,
              syncStatus: 'synced',
              syncedAt: nowIso,
              syncError: undefined,
            });
          }

          syncedCount += successfullyAppendedEntries.length;
        } catch (dateError: any) {
          console.error(`Sync error for ${dateStr}:`, dateError);
          errors.push(`${dateStr}: ${dateError.message || '同期エラー'}`);

          for (const entry of entries) {
            await StorageService.updateEntry({
              ...entry,
              syncStatus: 'failed',
              syncError: dateError.message || '同期エラー',
            });
          }
        }
      }
    } catch (err: any) {
      console.error('[GitLabSync] unexpected error:', err);
      errors.push(err.message || '予期せぬ同期エラー');
    }

    return { syncedCount, errors };
  }
}
