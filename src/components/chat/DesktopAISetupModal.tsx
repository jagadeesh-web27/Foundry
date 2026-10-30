import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ShieldCheck, WifiOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { DesktopAIStatus, DesktopLocalAIProvider } from '@/services/ai/desktopLocalProvider';

interface DesktopAISetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReady?: () => void;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const DesktopAISetupModal: React.FC<DesktopAISetupModalProps> = ({ isOpen, onClose, onReady }) => {
  const [provider] = useState(() => new DesktopLocalAIProvider());
  const [status, setStatus] = useState<DesktopAIStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const wasReady = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await provider.getModelStatus();
      setStatus(next);
      if (next.serverReady && !wasReady.current) {
        wasReady.current = true;
        onReady?.();
      }
      if (!next.serverReady) wasReady.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [provider, onReady]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) void refresh();
    });
    const timer = setInterval(() => {
      if (mounted) void refresh();
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [isOpen, refresh]);

  const run = async (action: () => Promise<DesktopAIStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloading = status?.downloadState === 'downloading';
  const percent =
    status && status.totalBytes > 0 ? Math.min(100, Math.round((status.downloadedBytes / status.totalBytes) * 100)) : 0;
  const ready = Boolean(status?.serverReady);
  const loading = Boolean(status?.modelFound && !status.serverReady && !downloading && status.runtimeFound);
  const failure = error || (status?.downloadState === 'error' ? status.errorMessage : null);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Foundry On-Device AI" maxWidth="max-w-xl">
      <div className="space-y-4 text-sm">
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)] leading-relaxed">
            <div className="font-semibold text-[var(--text-main)] flex items-center gap-2 mb-1">
              Private, built-in AI
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                <WifiOff className="w-3 h-3" /> Works offline
              </span>
            </div>
            Answers general questions and searches your files using a model that runs on this computer. Internet is
            needed only once, to download the model (about 2 GB). No Ollama, LM Studio or
            account required.
          </div>
        </div>

        {status && !status.runtimeFound && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              The local AI engine (llama-server) is missing from this installation, so the model cannot run. Place
              llama-server in the <code>llama-runtime</code> folder next to Foundry, then reopen this window.
            </span>
          </div>
        )}

        {failure && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{failure}</span>
          </div>
        )}

        {downloading && status && (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
            <div className="flex justify-between text-xs font-semibold text-amber-300">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Downloading model...
              </span>
              <span className="font-mono">{status.totalBytes > 0 ? `${percent}%` : ''}</span>
            </div>
            <div
              className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Model download progress"
            >
              <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.max(3, percent)}%` }} />
            </div>
            <div className="flex justify-between items-center text-[11px] font-mono text-amber-200/80">
              <span>
                {(status.downloadedBytes / MB).toFixed(0)} MB
                {status.totalBytes > 0 ? ` / ${(status.totalBytes / MB).toFixed(0)} MB` : ''}
              </span>
              <button
                type="button"
                onClick={() => void run(() => provider.cancelDownload())}
                className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div
            role="status"
            className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            <span>Loading the model into memory. This can take up to a minute the first time.</span>
            {!status?.serverRunning && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => provider.startEngine())}
                className="ml-auto px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Start now
              </button>
            )}
          </div>
        )}

        {ready && status && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-emerald-300">On-device AI is ready</div>
              <div className="text-[11px] text-emerald-400/80">
                {status.modelName} · {(status.modelSizeBytes / GB).toFixed(2)} GB
              </div>
            </div>
            <button
              type="button"
              title="Delete model"
              aria-label="Delete local AI model"
              onClick={() => {
                if (confirm('Delete the downloaded AI model from this computer?')) void run(() => provider.deleteModel());
              }}
              className="p-1.5 rounded text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {status && !status.modelFound && !downloading && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy || !status.runtimeFound}
              onClick={() => void run(() => provider.startDownload(customUrl.trim() || undefined))}
              className="w-full py-3 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download &amp; Install On-Device AI (~2 GB)
            </button>
            <button
              type="button"
              onClick={() => setShowCustomUrl(!showCustomUrl)}
              className="text-xs text-[var(--text-muted)] hover:underline"
            >
              {showCustomUrl ? 'Hide custom model URL' : 'Use a custom GGUF model URL'}
            </button>
            {showCustomUrl && (
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder={status.defaultDownloadUrl}
                aria-label="Custom GGUF model download URL"
                className="w-full px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-main)]"
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
