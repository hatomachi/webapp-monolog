import React, { useState } from 'react';
import { X, Check, AlertCircle, RefreshCw, Key, Database, Compass, Globe } from 'lucide-react';
import { StorageConfig } from '../types';
import { GitSyncService } from '../services/GitSyncService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: StorageConfig;
  onSaveConfig: (config: StorageConfig) => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTriggerSync,
  isSyncing,
}) => {
  const [formData, setFormData] = useState<StorageConfig>({ ...config });
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ tested: false, loading: false });

  if (!isOpen) return null;

  const isGitLab = formData.provider === 'gitlab';

  const handleChange = (field: keyof StorageConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestConnection = async () => {
    setTestResult({ tested: true, loading: true });
    const res = await GitSyncService.testConnection(formData);
    setTestResult({
      tested: true,
      loading: false,
      success: res.success,
      message: res.message,
    });

    if (res.success && res.detectedBranch && res.detectedBranch !== formData.branch) {
      handleChange('branch', res.detectedBranch);
    }
  };

  const handleSave = () => {
    onSaveConfig(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            設定 (Settings)
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォームボディ */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Git 連携設定 */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Key className={`w-3.5 h-3.5 ${isGitLab ? 'text-orange-400' : 'text-indigo-400'}`} />
                Git リモート同期連携
              </h3>
            </div>

            {/* プロバイダー切り替え */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                同期先プロバイダー
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleChange('provider', 'github');
                    setTestResult({ tested: false, loading: false });
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    !isGitLab
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200 shadow-sm shadow-indigo-500/20'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <span>GitHub</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleChange('provider', 'gitlab');
                    setTestResult({ tested: false, loading: false });
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    isGitLab
                      ? 'border-orange-500 bg-orange-950/40 text-orange-200 shadow-sm shadow-orange-500/20'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <span>社内GitLab / GitLab.com</span>
                </button>
              </div>
            </div>

            {/* GitLab Base URL 入力 */}
            {isGitLab && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-orange-400" />
                  GitLab サーバー URL (Base URL)
                </label>
                <input
                  type="url"
                  value={formData.baseUrl || ''}
                  onChange={(e) => handleChange('baseUrl', e.target.value)}
                  placeholder="例: https://gitlab.internal.example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-mono text-xs focus:border-orange-500 focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  社内GitLabのURLを指定してください（空欄の場合は https://gitlab.com）。
                </p>
              </div>
            )}

            {/* PAT 入力 */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                {isGitLab ? 'GitLab Personal Access Token (PAT)' : 'GitHub Personal Access Token (PAT)'}
              </label>
              <input
                type="password"
                value={formData.token}
                onChange={(e) => handleChange('token', e.target.value)}
                placeholder={isGitLab ? 'glpat-xxxxxxxxxxxx' : 'ghp_xxxxxxxxxxxx'}
                className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-mono text-xs focus:outline-none ${
                  isGitLab ? 'focus:border-orange-500' : 'focus:border-indigo-500'
                }`}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                {isGitLab
                  ? '「api」または「read_repository」「write_repository」権限が必要です。'
                  : 'リポジトリの Contents: Read and write 権限が必要です。'}
              </p>
            </div>

            {/* Owner & Repo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  {isGitLab ? 'グループ / 名前空間 (空欄可)' : 'Owner (ユーザー名)'}
                </label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => handleChange('owner', e.target.value)}
                  placeholder={isGitLab ? 'dev-team (空欄可)' : 'hatomachi'}
                  className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:outline-none ${
                    isGitLab ? 'focus:border-orange-500' : 'focus:border-indigo-500'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  {isGitLab ? 'プロジェクト名 または ID *' : 'Repo (リポジトリ) *'}
                </label>
                <input
                  type="text"
                  value={formData.repo}
                  onChange={(e) => handleChange('repo', e.target.value)}
                  placeholder={isGitLab ? 'personal-vault または 12345' : 'personal-vault'}
                  className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:outline-none ${
                    isGitLab ? 'focus:border-orange-500' : 'focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>

            {/* Branch & 保存先フォルダ */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Branch</label>
                <input
                  type="text"
                  value={formData.branch}
                  onChange={(e) => handleChange('branch', e.target.value)}
                  placeholder="main"
                  className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:outline-none ${
                    isGitLab ? 'focus:border-orange-500' : 'focus:border-indigo-500'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">保存先フォルダ</label>
                <input
                  type="text"
                  value={formData.basePath}
                  onChange={(e) => handleChange('basePath', e.target.value)}
                  placeholder="00_Inbox/monolog"
                  className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:outline-none ${
                    isGitLab ? 'focus:border-orange-500' : 'focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>

            {/* 接続テストボタン */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testResult.loading || !formData.token || !formData.repo}
                className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {testResult.loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    接続確認中...
                  </>
                ) : (
                  `${isGitLab ? 'GitLab' : 'GitHub'} 接続テスト`
                )}
              </button>

              {testResult.tested && !testResult.loading && (
                <div
                  className={`mt-2 p-2.5 rounded-xl text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/50 border border-rose-800/60 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          <hr className="border-zinc-800/80" />

          {/* 入力・操作設定 */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              動作・入力設定
            </h3>

            {/* Enter送信トグル */}
            <label className="flex items-center justify-between cursor-pointer py-1">
              <div>
                <div className="text-xs font-medium text-zinc-200">Enterキーで即送信</div>
                <div className="text-[11px] text-zinc-500">
                  {formData.sendOnEnter
                    ? 'Enterで送信、Shift+Enterで改行'
                    : '⌘+Enterで送信、Enterで改行'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.sendOnEnter}
                onChange={(e) => handleChange('sendOnEnter', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 relative"></div>
            </label>

            {/* 位置情報トグル */}
            <label className="flex items-center justify-between cursor-pointer py-1">
              <div>
                <div className="text-xs font-medium text-zinc-200">位置情報の自動記録</div>
                <div className="text-[11px] text-zinc-500">
                  つぶやき時に現在地（地名・座標）を自動付加
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.enableLocation}
                onChange={(e) => handleChange('enableLocation', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 relative"></div>
            </label>
          </div>

          <hr className="border-zinc-800/80" />

          {/* 手動同期トリガー */}
          <div className="pt-1">
            <button
              type="button"
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="w-full py-2 px-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '同期中...' : `今すぐ${isGitLab ? 'GitLab' : 'GitHub'}と同期`}</span>
            </button>
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-950 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-colors"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
};
