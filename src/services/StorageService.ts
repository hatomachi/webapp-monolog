import { get, set } from 'idb-keyval';
import { MonologEntry, StorageConfig } from '../types';

const CONFIG_STORAGE_KEY = 'monolog_storage_config';
const ENTRIES_IDB_KEY = 'monolog_local_entries_v1';

export const DEFAULT_CONFIG: StorageConfig = {
  provider: 'github',
  baseUrl: '',
  token: '',
  owner: '',
  repo: 'personal-vault',
  branch: 'main',
  basePath: '00_Inbox/monolog',
  enableLocation: true,
  sendOnEnter: true,
};

export class StorageService {
  /**
   * 設定を取得。webapp-obsidianの設定が存在する場合は自動的にトークンやowner、providerを提案・補完
   */
  static getConfig(): StorageConfig {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          provider: parsed.provider || 'github',
          baseUrl: parsed.baseUrl || '',
        };
      }

      // webapp-obsidian の設定があれば流用（初回起動時のユーザー体験向上）
      const obsidianVaultsRaw = localStorage.getItem('webapp_obsidian_vaults');
      if (obsidianVaultsRaw) {
        const vaults = JSON.parse(obsidianVaultsRaw);
        const personal = vaults.find((v: any) => v.repo === 'personal-vault') || vaults[0];
        if (personal) {
          return {
            ...DEFAULT_CONFIG,
            provider: personal.provider || 'github',
            baseUrl: personal.baseUrl || '',
            token: personal.token || '',
            owner: personal.owner || '',
            repo: personal.repo || 'personal-vault',
            branch: personal.branch || 'main',
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load storage config:', e);
    }
    return DEFAULT_CONFIG;
  }

  static saveConfig(config: StorageConfig): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save storage config:', e);
    }
  }

  /**
   * 全エントリを取得（新しい順にソート）
   */
  static async getEntries(): Promise<MonologEntry[]> {
    try {
      const entries = await get<MonologEntry[]>(ENTRIES_IDB_KEY);
      if (entries && Array.isArray(entries)) {
        return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch (e) {
      console.error('Failed to get entries from IndexedDB:', e);
    }
    return [];
  }

  /**
   * 新規エントリを先頭に追加（ローカル即時保存）
   */
  static async addEntry(entry: MonologEntry): Promise<MonologEntry[]> {
    const entries = await this.getEntries();
    const updated = [entry, ...entries];
    await set(ENTRIES_IDB_KEY, updated);
    return updated;
  }

  /**
   * エントリのステータス更新（同期成功など）
   */
  static async updateEntry(updatedEntry: MonologEntry): Promise<MonologEntry[]> {
    const entries = await this.getEntries();
    const index = entries.findIndex((e) => e.id === updatedEntry.id);
    if (index !== -1) {
      entries[index] = updatedEntry;
      await set(ENTRIES_IDB_KEY, entries);
    }
    return entries;
  }

  /**
   * エントリ削除
   */
  static async deleteEntry(id: string): Promise<MonologEntry[]> {
    const entries = await this.getEntries();
    const filtered = entries.filter((e) => e.id !== id);
    await set(ENTRIES_IDB_KEY, filtered);
    return filtered;
  }

  /**
   * 未同期のエントリを取得
   */
  static async getPendingEntries(): Promise<MonologEntry[]> {
    const entries = await this.getEntries();
    return entries.filter((e) => e.syncStatus === 'pending' || e.syncStatus === 'failed');
  }
}
