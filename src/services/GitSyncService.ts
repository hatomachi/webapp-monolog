import { StorageConfig } from '../types';
import { StorageService } from './StorageService';
import { GitHubSyncService } from './GitHubSyncService';
import { GitLabSyncService } from './GitLabSyncService';

export class GitSyncService {
  private static isSyncing = false;

  /**
   * 接続設定が完了しているかを検証
   */
  static isConfigured(config: StorageConfig): boolean {
    if (config.provider === 'gitlab') {
      return Boolean(config.token && config.repo);
    }
    return Boolean(config.token && config.owner && config.repo);
  }

  /**
   * 現在の設定または指定の設定で接続テストを実行
   */
  static async testConnection(
    config: StorageConfig
  ): Promise<{ success: boolean; message: string; username?: string; detectedBranch?: string }> {
    if (config.provider === 'gitlab') {
      return GitLabSyncService.testConnection(config);
    }
    return GitHubSyncService.testConnection(config);
  }

  /**
   * 未同期エントリをプロバイダー（GitHub / 社内GitLab）に同期
   */
  static async syncPendingEntries(): Promise<{ syncedCount: number; errors: string[] }> {
    if (this.isSyncing) {
      return { syncedCount: 0, errors: [] };
    }

    const config = StorageService.getConfig();
    if (!this.isConfigured(config)) {
      const providerLabel = config.provider === 'gitlab' ? 'GitLab' : 'GitHub';
      return { syncedCount: 0, errors: [`${providerLabel}設定が未完了です`] };
    }

    this.isSyncing = true;
    try {
      if (config.provider === 'gitlab') {
        return await GitLabSyncService.syncPendingEntries(config);
      }
      return await GitHubSyncService.syncPendingEntries(config);
    } finally {
      this.isSyncing = false;
    }
  }
}
