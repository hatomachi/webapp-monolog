import { Octokit } from '@octokit/rest';
import { StorageConfig } from '../types';
import { StorageService } from './StorageService';
import {
  buildMarkdownForDate,
  decodeBase64Utf8,
  encodeUtf8Base64,
  resolveFilePath,
} from './markdownFormatter';

export class GitHubSyncService {
  private static octokitCache = new Map<string, Octokit>();
  private static isSyncing = false;

  private static getOctokit(token: string): Octokit {
    let client = this.octokitCache.get(token);
    if (!client) {
      client = new Octokit({ auth: token });
      this.octokitCache.set(token, client);
    }
    return client;
  }

  /**
   * 接続テスト
   */
  static async testConnection(
    config: StorageConfig
  ): Promise<{ success: boolean; message: string; username?: string }> {
    if (!config.token || !config.owner || !config.repo) {
      return { success: false, message: 'Token, Owner, Repo が未入力です' };
    }

    try {
      const octokit = this.getOctokit(config.token);
      const { data: user } = await octokit.users.getAuthenticated();
      const { data: repo } = await octokit.repos.get({
        owner: config.owner,
        repo: config.repo,
      });

      return {
        success: true,
        message: `接続成功: ${repo.full_name} (${repo.private ? 'Private' : 'Public'}) / ユーザー: ${user.login}`,
        username: user.login,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'GitHub接続に失敗しました。トークンやリポジトリ名を確認してください。',
      };
    }
  }

  /**
   * 未同期エントリをバックグラウンドでGitHubに同期
   */
  static async syncPendingEntries(
    providedConfig?: StorageConfig
  ): Promise<{ syncedCount: number; errors: string[] }> {
    if (this.isSyncing) {
      return { syncedCount: 0, errors: [] };
    }

    const config = providedConfig || StorageService.getConfig();
    if (!config.token || !config.owner || !config.repo) {
      return { syncedCount: 0, errors: ['GitHub設定が未完了です'] };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    const errors: string[] = [];

    try {
      const pending = await StorageService.getPendingEntries();
      if (pending.length === 0) {
        return { syncedCount: 0, errors: [] };
      }

      // 日付（dateStr: YYYY-MM-DD）ごとにエントリをグループ化
      const byDate = new Map<string, typeof pending>();
      pending.forEach((entry) => {
        const list = byDate.get(entry.dateStr) || [];
        list.push(entry);
        byDate.set(entry.dateStr, list);
      });

      const octokit = this.getOctokit(config.token);

      for (const [dateStr, entries] of byDate.entries()) {
        try {
          const filePath = resolveFilePath(config.basePath, dateStr);

          // 既存ファイルを取得
          let existingContent = '';
          let fileSha: string | undefined = undefined;

          try {
            const { data } = await octokit.repos.getContent({
              owner: config.owner,
              repo: config.repo,
              path: filePath,
              ref: config.branch,
            });

            if (!Array.isArray(data) && data.type === 'file' && data.content) {
              fileSha = data.sha;
              existingContent = decodeBase64Utf8(data.content);
            }
          } catch (e: any) {
            if (e.status !== 404) {
              throw e;
            }
            // 404 (ファイル未存在) は新規作成として扱う
          }

          // 各エントリを追記フォーマットにマージ
          const { updatedContent, successfullyAppendedEntries } = buildMarkdownForDate(
            dateStr,
            existingContent,
            entries
          );

          if (successfullyAppendedEntries.length === 0) {
            continue;
          }

          // コミットメッセージ作成
          const times = successfullyAppendedEntries.map((e) => e.timeStr.slice(0, 5)).join(', ');
          const commitMsg = `feat(monolog): ${dateStr} [${times}]`;

          // GitHubへプッシュ
          await octokit.repos.createOrUpdateFileContents({
            owner: config.owner,
            repo: config.repo,
            path: filePath,
            message: commitMsg,
            content: encodeUtf8Base64(updatedContent),
            branch: config.branch,
            sha: fileSha,
          });

          // ローカルのステータスを同期済みに更新
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

          // 失敗ステータスをマーク
          for (const entry of entries) {
            await StorageService.updateEntry({
              ...entry,
              syncStatus: 'failed',
              syncError: dateError.message || '同期エラー',
            });
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return { syncedCount, errors };
  }
}

export * from './markdownFormatter';
