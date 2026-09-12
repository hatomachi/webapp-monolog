import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MapPin, Loader2, CornerDownLeft } from 'lucide-react';
import { LocationInfo, LocationStatus } from '../types';

interface InputAreaProps {
  onSend: (text: string, location?: LocationInfo) => void;
  locationStatus: LocationStatus;
  sendOnEnter: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({
  onSend,
  locationStatus,
  sendOnEnter,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // マウント時に自動フォーカスを試みる
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 画面のどこかをタップしたとき、入力欄にフォーカスを当てる（ワンタップでキーボード起動）
  const handleContainerClick = (e: React.MouseEvent) => {
    // ボタンや設定アイコン以外のタップならフォーカス
    if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'A') {
      textareaRef.current?.focus();
    }
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 微小な触覚フィードバック（iOS/Androidサポート時）
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch (_) {}
    }

    // 最新の事前取得済み位置情報を付与
    const loc = locationStatus.currentLocation;
    onSend(trimmed, loc);

    // 0msでクリア & フォーカス維持（続けて打てる）
    setText('');
    textareaRef.current?.focus();
  }, [text, locationStatus.currentLocation, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 変換中（IME入力中）のEnterは送信しない
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (sendOnEnter) {
      // Enter単体で送信、Shift+Enterで改行
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      // Cmd+Enter または Ctrl+Enter で送信
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  return (
    <div
      onClick={handleContainerClick}
      className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur transition-all duration-150 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30 cursor-text"
    >
      {/* 位置情報ステータスバー */}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 px-1 select-none">
        <div className="flex items-center space-x-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span className="truncate max-w-[240px] text-zinc-300">
            {locationStatus.state === 'locating' && (
              <span className="inline-flex items-center gap-1 text-zinc-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                測位中...
              </span>
            )}
            {locationStatus.state === 'ready' && (
              <span>{locationStatus.currentLocation?.address || '位置情報取得完了'}</span>
            )}
            {locationStatus.state === 'denied' && (
              <span className="text-zinc-500">位置情報OFF</span>
            )}
            {locationStatus.state === 'idle' && <span className="text-zinc-500">待機中</span>}
            {locationStatus.state === 'error' && (
              <span className="text-zinc-500">位置情報なし</span>
            )}
          </span>
        </div>

        <span className="text-[11px] text-zinc-500 font-mono flex-shrink-0">
          {sendOnEnter ? 'Enterで送信' : '⌘+Enterで送信'}
        </span>
      </div>

      {/* メイン入力テキストエリア */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="今、何を考えてる？（0.1秒でメモ）"
        rows={3}
        className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-base sm:text-lg resize-none outline-none leading-relaxed block selection:bg-indigo-600/40"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck="false"
      />

      {/* アクションフッター */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/50 select-none">
        <span className="text-xs text-zinc-500 font-mono">
          {text.length > 0 ? `${text.length} 文字` : ''}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSend();
          }}
          disabled={!text.trim()}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
            text.trim()
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95'
              : 'bg-zinc-800/80 text-zinc-500 cursor-not-allowed'
          }`}
        >
          <span>送信</span>
          {sendOnEnter ? (
            <CornerDownLeft className="w-3.5 h-3.5 opacity-80" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
};
