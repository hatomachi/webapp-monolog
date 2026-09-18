import { MonologEntry, StorageConfig } from '../types';
import { StorageService } from './StorageService';
import {
  buildMarkdownForDate,
  encodeUtf8Base64,
  resolveFilePath,
} from './markdownFormatter';

export class GitLabSyncService {
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
   * 接続テスト
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
      const projectId = this.getProjectId(config);
      const projRes = await this.apiFetch(config, `/projects/${projectId}`);
      if (!projRes.ok) {
        let errMsg = `${projRes.status} ${projRes.statusText}`;
        try {
          const errJson = await projRes.json();
          if (errJson.message) {
            errMsg += ` - ${typeof errJson.message === 'string' ? errJson.message : JSON.stringify(errJson.message)}`;
          }
        } catch {}
        return {
          success: false,
          message: `GitLabプロジェクト "${config.owner ? `${config.owner}/${config.repo}` : config.repo}" の取得に失敗しました: ${errMsg}`,
        };
      }

      const projData = await projRes.json();
      const defaultBranch = projData.default_branch || 'master';
      const projectName = projData.path_with_namespace || projData.name || config.repo;

      // 3. ブランチ存在確認
      const targetBranch = config.branch?.trim() || defaultBranch;
      let finalBranch = targetBranch;

      const branchRes = await this.apiFetch(
        config,
        `/projects/${projectId}/repository/branches/${encodeURIComponent(targetBranch)}`
      );
      if (!branchRes.ok && targetBranch !== defaultBranch) {
        const defBranchRes = await this.apiFetch(
          config,
          `/projects/${projectId}/repository/branches/${encodeURIComponent(defaultBranch)}`
        );
        if (defBranchRes.ok) {
          finalBranch = defaultBranch;
        }
      }

      const userPart = username ? `ユーザー: ${username}` : 'トークン有効';
      const branchNotice =
        finalBranch !== config.branch && config.branch
          ? `ブランチ: ${finalBranch} (指定の "${config.branch}" が無いため自動切替)`
          : `ブランチ: ${finalBranch}`;

      return {
        success: true,
        message: `接続成功: ${projectName} [ID: ${projData.id}] (${userPart} / ${branchNotice})`,
        username,
        detectedBranch: finalBranch,
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

      // 日付（dateStr: YYYY-MM-DD）ごとにエントリをグループ化
      const byDate = new Map<string, MonologEntry[]>();
      pending.forEach((entry) => {
        const list = byDate.get(entry.dateStr) || [];
        list.push(entry);
        byDate.set(entry.dateStr, list);
      });

      const projectId = this.getProjectId(config);
      const targetBranch = config.branch?.trim() || 'main';

      for (const [dateStr, entries] of byDate.entries()) {
        try {
          const filePath = resolveFilePath(config.basePath, dateStr);
          const encodedFilePath = encodeURIComponent(filePath);

          // 1. 既存ファイルを取得
          let existingContent = '';
          let fileExists = false;

          try {
            // raw エンドポイントで直接ファイル内容を取得
            const getRes = await this.apiFetch(
              config,
              `/projects/${projectId}/repository/files/${encodedFilePath}/raw?ref=${encodeURIComponent(targetBranch)}`
            );

            if (getRes.ok) {
              existingContent = await getRes.text();
              fileExists = true;
            } else if (getRes.status !== 404) {
              console.warn(`[GitLabSync] file get returned status ${getRes.status}`);
            }
          } catch (fetchErr) {
            console.warn('[GitLabSync] Failed to fetch existing file, treating as new:', fetchErr);
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
          // Commits API は file_path を JSON body に含めるため、リバースプロキシの %2F デコード問題が発生しない
          const base64Content = encodeUtf8Base64(updatedContent);
          let action: 'create' | 'update' = fileExists ? 'update' : 'create';

          const buildPayload = (act: 'create' | 'update') => ({
            branch: targetBranch,
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
            body: JSON.stringify(buildPayload(action)),
          });

          // 競合または作成・更新の食い違い時の自動フォールバック
          if (!commitRes.ok) {
            const fallbackAction: 'create' | 'update' = action === 'create' ? 'update' : 'create';
            console.warn(
              `[GitLabSync] Commit failed with action "${action}" (${commitRes.status}). Retrying with "${fallbackAction}"...`
            );
            const retryRes = await this.apiFetch(config, `/projects/${projectId}/repository/commits`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(buildPayload(fallbackAction)),
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
