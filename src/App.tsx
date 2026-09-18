import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { MonologEntry, StorageConfig, LocationInfo, LocationStatus } from './types';
import { StorageService } from './services/StorageService';
import { LocationService } from './services/LocationService';
import { GitSyncService } from './services/GitSyncService';
import { InputArea } from './components/InputArea';
import { Timeline } from './components/Timeline';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [entries, setEntries] = useState<MonologEntry[]>([]);
  const [config, setConfig] = useState<StorageConfig>(() => StorageService.getConfig());
  const [locationStatus, setLocationStatus] = useState<LocationStatus>({ state: 'idle' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 初期化: エントリ読込、GPS事前測位開始、初期同期
  useEffect(() => {
    // 1. ローカルキャッシュ読込 (0ms)
    StorageService.getEntries().then((loaded) => {
      setEntries(loaded);
    });

    // 2. 位置情報の事前取得 (Prefetch)
    if (config.enableLocation) {
      const unsubscribe = LocationService.subscribe((status) => {
        setLocationStatus(status);
      });
      LocationService.startPrefetch();
      return () => {
        unsubscribe();
        LocationService.stop();
      };
    }
  }, [config.enableLocation]);

  // バックグラウンド同期実行
  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const providerLabel = config.provider === 'gitlab' ? 'GitLab' : 'GitHub';
      const res = await GitSyncService.syncPendingEntries();
      // 最新のローカルステータス（同期完了フラグ）を反映
      const updated = await StorageService.getEntries();
      setEntries(updated);

      if (res.syncedCount > 0) {
        setSyncToast({
          message: `${res.syncedCount} 件を ${providerLabel} に同期しました`,
          type: 'success',
        });
        setTimeout(() => setSyncToast(null), 3000);
      } else if (res.errors.length > 0) {
        setSyncToast({
          message: res.errors[0],
          type: 'error',
        });
        setTimeout(() => setSyncToast(null), 4000);
      }
    } catch (e: any) {
      console.error('Manual sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, config.provider]);

  // アプリ起動時 & オンライン復帰時の自動同期
  useEffect(() => {
    if (GitSyncService.isConfigured(config)) {
      triggerSync();
    }

    const handleOnline = () => {
      triggerSync();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [config, triggerSync]);

  // つぶやき送信ハンドラ（0.1秒入力・完全ローカルファースト）
  const handleSend = async (text: string, location?: LocationInfo) => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const isConfigured = GitSyncService.isConfigured(config);

    const newEntry: MonologEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text,
      createdAt: now.toISOString(),
      dateStr,
      timeStr,
      location: config.enableLocation ? location : undefined,
      syncStatus: isConfigured ? 'pending' : 'synced', // トークン未設定時はローカル完結
    };

    // 0msローカル即時保存
    const updated = await StorageService.addEntry(newEntry);
    setEntries(updated);

    // バックグラウンドでリモート同期をトリガー
    if (isConfigured) {
      setTimeout(() => {
        triggerSync();
      }, 300);
    }
  };

  // エントリ削除
  const handleDeleteEntry = async (id: string) => {
    const updated = await StorageService.deleteEntry(id);
    setEntries(updated);
  };

  // 設定保存
  const handleSaveConfig = (newConfig: StorageConfig) => {
    StorageService.saveConfig(newConfig);
    setConfig(newConfig);
  };

  // 未同期件数
  const pendingCount = entries.filter((e) => e.syncStatus === 'pending').length;
  const failedCount = entries.filter((e) => e.syncStatus === 'failed').length;
  const isConfigured = GitSyncService.isConfigured(config);
  const providerLabel = config.provider === 'gitlab' ? 'GitLab' : 'GitHub';

  return (
    <div className="flex flex-col h-full w-full max-w-lg mx-auto bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* 上部ヘッダー（セーフエリア対応） */}
      <header className="flex-shrink-0 pt-[max(env(safe-area-inset-top),0.75rem)] px-4 pb-2.5 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              Monolog
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono -mt-0.5">
              {entries.length} 思考ログ蓄積中
            </p>
          </div>
        </div>

        {/* 同期ステータス ＆ 設定ボタン */}
        <div className="flex items-center space-x-1.5">
          {/* 同期バッジ */}
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-colors hover:bg-zinc-900 border border-zinc-800/80"
            title="クリックで今すぐ同期"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                <span className="text-[11px] text-zinc-400">同期中</span>
              </>
            ) : pendingCount > 0 ? (
              <>
                <RefreshCw className="w-3 h-3 text-amber-400" />
                <span className="text-[11px] text-amber-300 font-medium">未同期 {pendingCount}</span>
              </>
            ) : failedCount > 0 ? (
              <>
                <AlertCircle className="w-3 h-3 text-rose-400" />
                <span className="text-[11px] text-rose-300 font-medium">エラー {failedCount}</span>
              </>
            ) : isConfigured ? (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {providerLabel}同期
              </span>
            ) : (
              <span className="text-[11px] text-zinc-500">未設定</span>
            )}
          </button>

          {/* 設定ボタン */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            title="設定"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 同期トースト通知 */}
      {syncToast && (
        <div className="px-4 py-1.5 bg-indigo-950/80 border-b border-indigo-800/50 text-indigo-200 text-xs text-center flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-200">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span>{syncToast.message}</span>
        </div>
      )}

      {/* メインコンテンツエリア */}
      <main className="flex-1 flex flex-col min-h-0 px-3 sm:px-4 pt-3 overflow-hidden">
        {/* 最重要：0.1秒入力エリア */}
        <div className="flex-shrink-0 mb-3">
          <InputArea
            onSend={handleSend}
            locationStatus={locationStatus}
            sendOnEnter={config.sendOnEnter}
          />
        </div>

        {/* タイムライン（スクロールエリア） */}
        <div className="flex-1 overflow-y-auto no-scrollbar pt-1 pb-safe">
          <Timeline
            entries={entries}
            onDelete={handleDeleteEntry}
            onRetrySync={triggerSync}
          />
        </div>
      </main>

      {/* 設定モーダル */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        onTriggerSync={triggerSync}
        isSyncing={isSyncing}
      />
    </div>
  );
};
