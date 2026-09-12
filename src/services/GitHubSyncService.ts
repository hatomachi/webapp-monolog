import { Octokit } from '@octokit/rest';
import { MonologEntry, StorageConfig } from '../types';
import { StorageService } from './StorageService';

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
  static async testConnection(config: StorageConfig): Promise<{ success: boolean; message: string }> {
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
  static async syncPendingEntries(): Promise<{ syncedCount: number; errors: string[] }> {
    if (this.isSyncing) {
      return { syncedCount: 0, errors: [] };
    }

    const config = StorageService.getConfig();
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
      const byDate = new Map<string, MonologEntry[]>();
      pending.forEach((entry) => {
        const list = byDate.get(entry.dateStr) || [];
        list.push(entry);
        byDate.set(entry.dateStr, list);
      });

      const octokit = this.getOctokit(config.token);

      for (const [dateStr, entries] of byDate.entries()) {
        try {
          // パス決定: 例 "00_Inbox/monolog/2026/2026-09-12.md"
          const year = dateStr.slice(0, 4);
          const cleanBasePath = config.basePath.replace(/^\/+|\/+$/g, '');
          const filePath = cleanBasePath ? `${cleanBasePath}/${year}/${dateStr}.md` : `${year}/${dateStr}.md`;

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

          // 新規作成時の初期ヘッダー
          if (!existingContent.trim()) {
            const dayOfWeek = getDayOfWeek(dateStr);
            existingContent = `# ${dateStr} (${dayOfWeek})\n\n`;
          }

          // 各エントリを追記フォーマットに変換
          let updatedContent = existingContent;
          const successfullyAppendedEntries: MonologEntry[] = [];

          // 日時順（古い順）に追記
          const sortedEntries = [...entries].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          for (const entry of sortedEntries) {
            // 既にファイル内に同じIDが存在している場合はスキップ（二重追記防止）
            if (updatedContent.includes(`id=${entry.id}`)) {
              successfullyAppendedEntries.push(entry);
              continue;
            }

            const formattedEntry = formatEntryToMarkdown(entry);
            if (!updatedContent.endsWith('\n\n') && !updatedContent.endsWith('\n')) {
              updatedContent += '\n\n';
            } else if (!updatedContent.endsWith('\n\n')) {
              updatedContent += '\n';
            }
            updatedContent += formattedEntry + '\n';
            successfullyAppendedEntries.push(entry);
          }

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

/**
 * MonologEntry を Obsidian 互換の Markdown ブロックにフォーマット
 */
function formatEntryToMarkdown(entry: MonologEntry): string {
  const shortTime = entry.timeStr.slice(0, 5); // HH:mm
  let locationPart = '';

  if (entry.location) {
    if (entry.location.address) {
      locationPart = ` 📍 *${entry.location.address}*`;
    } else {
      locationPart = ` 📍 *[${entry.location.latitude}, ${entry.location.longitude}]*`;
    }
  }

  // 本文の複数行処理（箇条書きリスト内でのインデント）
  const lines = entry.text.split('\n');
  const firstLine = lines[0];
  const restLines = lines.slice(1).map((l) => `  ${l}`).join('\n');

  let body = `- **${shortTime}**${locationPart}  \n  ${firstLine}`;
  if (restLines) {
    body += `\n${restLines}`;
  }

  // メタデータ（ID、座標等）
  const metaParts = [`id=${entry.id}`];
  if (entry.location) {
    metaParts.push(`geo=${entry.location.latitude},${entry.location.longitude}`);
  }
  const commentTag = `  <!-- monolog:${metaParts.join(';')} -->`;

  return `${body}\n${commentTag}`;
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()] || '';
}

function encodeUtf8Base64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64Utf8(base64: string): string {
  return decodeURIComponent(escape(atob(base64.replace(/\n/g, ''))));
}
