export interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string; // 逆ジオコーディング地名 (例: "東京都渋谷区道玄坂")
  timestamp: number;
}

export interface MonologEntry {
  id: string; // タイムスタンプ + ランダム文字列 (一意キー)
  text: string;
  createdAt: string; // ISO 8601 (例: 2026-09-12T15:42:00.000Z)
  dateStr: string; // YYYY-MM-DD (ローカル日付)
  timeStr: string; // HH:mm:ss (ローカル時間)
  location?: LocationInfo;
  syncStatus: 'pending' | 'synced' | 'failed';
  syncError?: string;
  syncedAt?: string;
}

export interface StorageConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  basePath: string; // デフォルト: "00_Inbox/monolog"
  enableLocation: boolean;
  sendOnEnter: boolean; // Enterで送信（モバイルの場合はShift+Enterで改行、または送信ボタン）
}

export interface LocationStatus {
  state: 'idle' | 'locating' | 'ready' | 'denied' | 'error';
  currentLocation?: LocationInfo;
  errorMessage?: string;
}
