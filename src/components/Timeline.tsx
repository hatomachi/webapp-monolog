import React, { useState } from 'react';
import { MapPin, CheckCircle2, Clock, AlertCircle, Copy, Check, Trash2 } from 'lucide-react';
import { MonologEntry } from '../types';

interface TimelineProps {
  entries: MonologEntry[];
  onDelete: (id: string) => void;
  onRetrySync?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  entries,
  onDelete,
  onRetrySync,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (entry: MonologEntry) => {
    const locText = entry.location?.address ? ` (${entry.location.address})` : '';
    const textToCopy = `${entry.timeStr.slice(0, 5)}${locText}\n${entry.text}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 px-4 select-none">
        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-600">
          <Clock className="w-6 h-6" />
        </div>
        <p className="text-zinc-400 text-sm font-medium">まだ投稿がありません</p>
        <p className="text-zinc-600 text-xs mt-1">
          上の入力欄に今思ったことを書いて、Enterを押してみてください。
        </p>
      </div>
    );
  }

  // 日付（dateStr）ごとにグループ化
  const groupedByDate: Record<string, MonologEntry[]> = {};
  entries.forEach((entry) => {
    const date = entry.dateStr;
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(entry);
  });

  const dates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6 pb-16">
      {dates.map((dateStr) => {
        const dayEntries = groupedByDate[dateStr];
        const isToday = dateStr === new Date().toISOString().slice(0, 10);

        return (
          <div key={dateStr} className="space-y-2.5">
            {/* 日付ヘッダー */}
            <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur py-1.5 px-2 flex items-center justify-between border-b border-zinc-800/40 select-none">
              <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                {isToday ? '今日 (Today)' : dateStr}
              </span>
              <span className="text-[11px] text-zinc-600 font-mono">
                {dayEntries.length} 件
              </span>
            </div>

            {/* エントリカード一覧 */}
            <div className="space-y-2">
              {dayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="group bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/60 rounded-xl p-3.5 transition-all duration-150"
                >
                  {/* ヘッダー情報（時間、位置、ステータス） */}
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 select-none">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="font-mono font-medium text-zinc-300">
                        {entry.timeStr.slice(0, 5)}
                      </span>

                      {entry.location && (
                        <div className="flex items-center space-x-1 text-zinc-400 truncate max-w-[200px]">
                          <MapPin className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                          <span className="truncate text-[11px]">
                            {entry.location.address || `${entry.location.latitude.toFixed(3)}, ${entry.location.longitude.toFixed(3)}`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {/* 同期ステータス */}
                      {entry.syncStatus === 'synced' && (
                        <span title="リモート同期済み" className="text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {entry.syncStatus === 'pending' && (
                        <span title="リモート同期待機中" className="text-amber-400 animate-pulse">
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {entry.syncStatus === 'failed' && (
                        <button
                          onClick={onRetrySync}
                          title={`同期失敗: ${entry.syncError || '再試行'}`}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* コピーボタン */}
                      <button
                        onClick={() => handleCopy(entry)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                        title="テキストをコピー"
                      >
                        {copiedId === entry.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* 削除ボタン */}
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="text-zinc-600 hover:text-rose-400 transition-colors p-1"
                        title="ローカルから削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 本文 */}
                  <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed pl-0.5">
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
