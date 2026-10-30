import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  RefreshCw,
  Zap,
  ExternalLink,
  Server,
  Sparkles,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { invoke } from '@tauri-apps/api/core';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({ isOpen, onClose }) => {
  const [pcHost, setPcHost] = useState(() => {
    return localStorage.getItem('foundry_pc_host') || '';
  });
  const [pcPort, setPcPort] = useState('5173');
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const pcUrl = `http://${pcHost.trim()}:${pcPort.trim()}`;
  const apkDownloadUrl = `${pcUrl}/Foundry-Android-debug.apk`;
  const isAndroidApp = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent) &&
    typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  const handleSaveHost = (newHost: string) => {
    setPcHost(newHost);
    localStorage.setItem('foundry_pc_host', newHost);
  };

  const handleTestConnection = useCallback(async () => {
    setPingStatus('checking');
    try {
      await fetch(`${pcUrl}/favicon.svg`, {
        signal: AbortSignal.timeout(3000),
        mode: 'no-cors',
      });
      setPingStatus('online');
    } catch {
      // Also try AI port 8082
      try {
        await fetch(`http://${pcHost.trim()}:8082/health`, {
          signal: AbortSignal.timeout(2000),
          mode: 'no-cors',
        });
        setPingStatus('online');
      } catch {
        setPingStatus('offline');
      }
    }
  }, [pcUrl, pcHost]);

  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      void Promise.resolve().then(() => {
        if (isMounted) void handleTestConnection();
      });
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, handleTestConnection]);

  const handleDownloadApk = () => {
    void handleInstallLatestApk();
  };

  const handleInstallLatestApk = async () => {
    setIsUpdating(true);
    setUpdateMessage(isAndroidApp ? 'Downloading APK and opening Android installer...' : 'Preparing APK download...');
    try {
      if (isAndroidApp) {
        const result = JSON.parse(await invoke<string>('android_download_and_install_apk', { url: apkDownloadUrl }));
        setIsUpdating(false);
        setUpdateMessage(result.message || 'Android installer opened. Confirm the update on the phone.');
        return;
      }

      // Trigger browser/webview download of the APK
      const a = document.createElement('a');
      a.href = apkDownloadUrl;
      a.download = 'Foundry-Android-debug.apk';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        setIsUpdating(false);
        setUpdateMessage('APK download started. Open the downloaded file and confirm installation in Android.');
      }, 2500);
    } catch (err: any) {
      setIsUpdating(false);
      setUpdateMessage(`Download error: ${err?.message || 'Check PC connection'}`);
    }
  };

  const handleSwitchToLiveSync = () => {
    if (confirm(`Switch this app to live sync with PC dev server at ${pcUrl}?\n\nIn live sync mode, any code edit on your PC updates your phone instantly without rebuilding!`)) {
      window.location.href = pcUrl;
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isAndroidApp ? 'Install Latest Build' : 'Development Update & Live Sync'} maxWidth="max-w-xl">
      <div className="space-y-5 text-xs text-[var(--text-main)] max-h-[80vh] overflow-y-auto pr-1">
        {/* Banner */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-600/15 to-indigo-600/15 border border-blue-500/30 flex items-start space-x-3">
          <Zap className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm text-blue-300 m-0">Install a Build from the Development PC</h4>
            <p className="text-[11px] text-blue-200/80 mt-1 m-0">
              USB ADB installation is the reliable development workflow. This action downloads the APK from the configured development host and opens Android's package installer; it does not silently install code.
            </p>
          </div>
        </div>

        {/* PC Host IP Config */}
        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-xs">Host PC Connection</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  pingStatus === 'online'
                    ? 'bg-emerald-500'
                    : pingStatus === 'checking'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[10px] text-[var(--text-faint)] capitalize">
                {pingStatus === 'online' ? 'PC Reachable' : pingStatus === 'checking' ? 'Checking...' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] text-[var(--text-muted)] mb-1">PC IP Address (Local Wi-Fi)</label>
              <input
                type="text"
                value={pcHost}
                onChange={(e) => handleSaveHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-main)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-muted)] mb-1">Dev Port</label>
              <input
                type="text"
                value={pcPort}
                onChange={(e) => setPcPort(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-main)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={pingStatus === 'checking'}
              onClick={handleTestConnection}
              className="text-xs"
            >
              Test PC Connection
            </Button>
          </div>
        </div>

        {/* Option 1: Direct APK Update */}
        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-xs text-[var(--text-main)] m-0 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-blue-400" />
                <span>Download & Install Latest APK</span>
              </h4>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 m-0">
                Downloads the APK currently served by the development host and opens Android's installer for confirmation.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadApk}
              disabled={isUpdating}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-xs transition-colors flex items-center space-x-1.5 flex-shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${isUpdating ? 'animate-bounce' : ''}`} />
                <span>{isUpdating ? 'Preparing...' : isAndroidApp ? 'Install Latest Build' : 'Download APK'}</span>
            </button>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="text-[10px] text-[var(--text-faint)] font-medium">Or open in your phone browser:</div>
            <div className="flex items-center justify-between gap-2">
              <a
                href={`${pcUrl}/download`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline font-mono truncate"
              >
                {pcUrl}/download
              </a>
              <span className="text-[10px] text-[var(--text-faint)] font-mono">or /foundry.apk</span>
            </div>
          </div>

          {updateMessage && (
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
              {updateMessage}
            </div>
          )}
        </div>

        {/* Option 2: Live Sync (Instant HMR, 0 Rebuilds) */}
        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-xs text-[var(--text-main)] m-0 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Live Dev Sync (Instant Hot Reload)</span>
              </h4>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 m-0">
                Connect the app to your PC's Vite server. Every code change you save on PC updates instantly on your phone with zero builds!
              </p>
            </div>
            <button
              type="button"
              onClick={handleSwitchToLiveSync}
              className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs shadow-xs transition-colors flex items-center space-x-1.5 flex-shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Connect Live</span>
            </button>
          </div>
        </div>

        {/* Option 3: Quick Reload */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="font-medium text-xs">Reload App Frontend</div>
              <div className="text-[10px] text-[var(--text-faint)]">Clear temporary caches and refresh interface</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReload}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)] transition-colors cursor-pointer"
          >
            Reload Now
          </button>
        </div>
      </div>
    </Modal>
  );
};
