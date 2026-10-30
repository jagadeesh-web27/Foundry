import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  RefreshCw,
  X,
  Trash2,
  WifiOff,
  ServerOff,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { AndroidLocalAIProvider, LocalAIModelStatus, LowLevelInferenceResult } from '@/services/ai/androidLocalProvider';

interface LocalAISetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelReady?: () => void;
}

export const LocalAISetupModal: React.FC<LocalAISetupModalProps> = ({
  isOpen,
  onClose,
  onModelReady,
}) => {
  const [provider] = useState(() => new AndroidLocalAIProvider());
  const [status, setStatus] = useState<LocalAIModelStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [testPrompt, setTestPrompt] = useState('Explain TypeScript in one sentence.');
  const [testResult, setTestResult] = useState<LowLevelInferenceResult | null>(null);
  const [isTestingInference, setIsTestingInference] = useState(false);
  const pollIntervalRef = useRef<any>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const current = await provider.getModelStatus();
      setStatus(current);
      if (current.ready && onModelReady) {
        onModelReady();
      }
    } catch (e: any) {
      console.error('Failed to get local AI status:', e);
    }
  }, [provider, onModelReady]);

  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    let isMounted = true;
    void Promise.resolve().then(() => {
      if (isMounted) void fetchStatus();
    });

    pollIntervalRef.current = setInterval(() => {
      if (isMounted) void fetchStatus();
    }, 1000);

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  const handleStartDownload = async () => {
    setIsLoading(true);
    try {
      const urlToUse = customUrl.trim() || undefined;
      const res = await provider.startDownload(urlToUse);
      setStatus(res);
    } catch (e: any) {
      alert(`Download failed to start: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDownload = async () => {
    try {
      const res = await provider.cancelDownload();
      setStatus(res);
    } catch (e: any) {
      console.error('Failed to cancel download:', e);
    }
  };

  const handleLoadModel = async () => {
    setIsLoading(true);
    try {
      const res = await provider.loadModel();
      setStatus(res);
    } catch (e: any) {
      alert(`Model loading failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async () => {
    if (!confirm('Are you sure you want to delete the installed local AI model from device storage?')) return;
    setIsLoading(true);
    try {
      const res = await provider.deleteModel();
      setStatus(res);
      setTestResult(null);
    } catch (e: any) {
      alert(`Failed to delete model: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTest = async (prompt: string) => {
    setIsTestingInference(true);
    setTestPrompt(prompt);
    setTestResult(null);
    try {
      const result = await provider.testInference(prompt);
      setTestResult(result);
      fetchStatus();
    } catch (e: any) {
      setTestResult({
        success: false,
        prompt,
        error: e.message || 'Inference test execution failed',
        state: 'INFERENCE_ERROR',
      });
    } finally {
      setIsTestingInference(false);
    }
  };

  const isDownloading = status?.state === 'MODEL_DOWNLOADING';
  const isVerifying = status?.state === 'MODEL_VERIFYING';
  const isLoadingModel = status?.state === 'MODEL_LOADING';
  const isReady = status?.state === 'MODEL_READY';
  const hasError = status?.state === 'MODEL_ERROR' || status?.state === 'INFERENCE_ERROR';

  const getStateColor = (state?: string) => {
    switch (state) {
      case 'MODEL_READY':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'INFERENCE_RUNNING':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30 animate-pulse';
      case 'MODEL_DOWNLOADING':
      case 'MODEL_VERIFYING':
      case 'MODEL_LOADING':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'MODEL_ERROR':
      case 'INFERENCE_ERROR':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default:
        return 'text-[var(--text-muted)] bg-[var(--bg-card)] border-[var(--border-subtle)]';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)] m-0 leading-tight">
                Foundry Standalone On-Device AI
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                Google MediaPipe Tasks GenAI on Android
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Offline Standalone Guarantee Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/30 to-blue-950/30 border border-purple-800/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 text-purple-200">
              <div className="font-semibold text-purple-100 flex items-center gap-2">
                <span>100% On-Device Reasoning</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300">
                  <WifiOff className="w-3 h-3" /> Offline Capable
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300">
                  <ServerOff className="w-3 h-3" /> No PC Server
                </span>
              </div>
              <p className="text-purple-300/90 leading-relaxed m-0">
                Core AI reasoning runs natively on your phone&apos;s processor. Internet is required <strong>only</strong> for the initial model download. After setup, zero network connection is needed.
              </p>
            </div>
          </div>

          {/* Real State Badge */}
          <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Current AI Runtime State
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border ${getStateColor(
                  status?.state
                )}`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                {status?.state || 'CHECKING_STATE...'}
              </span>
            </div>

            {/* Model Hardware Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
              <div className="p-2 rounded-lg bg-[var(--bg-surface)]">
                <span className="text-[10px] text-[var(--text-muted)] block">Model</span>
                <span className="font-medium text-[var(--text-main)] truncate block">
                  {status?.modelName || 'Gemma 2B IT'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)]">
                <span className="text-[10px] text-[var(--text-muted)] block">Format</span>
                <span className="font-medium text-[var(--text-main)] block">MediaPipe .task</span>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)]">
                <span className="text-[10px] text-[var(--text-muted)] block">Storage</span>
                <span className="font-medium text-[var(--text-main)] block">
                  {status?.modelSizeBytes && status.modelSizeBytes > 0
                    ? `${(status.modelSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                    : '~1.4 GB req.'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)]">
                <span className="text-[10px] text-[var(--text-muted)] block">Target RAM</span>
                <span className="font-medium text-[var(--text-main)] block">~2.0 GB</span>
              </div>
            </div>

            {status?.modelPath && (
              <div className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] p-2 rounded-lg truncate">
                Location: {status.modelPath}
              </div>
            )}

            {hasError && status?.errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{status.errorMessage}</span>
                </div>
                {status && status.modelSizeBytes > 0 && (
                  <button
                    onClick={handleLoadModel}
                    disabled={isLoading}
                    className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold shrink-0"
                  >
                    Retry Load
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Download Progress View */}
          {isDownloading && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Downloading model weights...
                </span>
                <span className="font-mono">{status.downloadProgress}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden border border-amber-500/30">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, status.downloadProgress)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-amber-200/80">
                <span>
                  {(status.downloadBytes / (1024 * 1024)).toFixed(1)} MB /{' '}
                  {(status.totalBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
                <button
                  onClick={handleCancelDownload}
                  className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors"
                >
                  Cancel Download
                </button>
              </div>
            </div>
          )}

          {/* Verifying View */}
          {isVerifying && (
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-3 text-purple-300 text-xs font-medium">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
              <span>Verifying local model container integrity and task metadata...</span>
            </div>
          )}

          {/* Loading View */}
          {isLoadingModel && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3 text-blue-300 text-xs font-medium">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
              <span>Loading MediaPipe LlmInference session into device memory...</span>
            </div>
          )}

          {/* Setup Actions (When not ready and not downloading) */}
          {!isReady && !isDownloading && !isVerifying && !isLoadingModel && (
            <div className="space-y-3">
              <button
                onClick={handleStartDownload}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                <Download className="w-4 h-4" />
                <span>Download & Install Local AI (~1.4 GB)</span>
              </button>

              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <button
                  onClick={() => setShowCustomUrl(!showCustomUrl)}
                  className="hover:underline text-[var(--text-secondary)]"
                >
                  {showCustomUrl ? 'Hide Custom URL' : 'Use Custom Model URL / Mirror'}
                </button>
                <button
                  onClick={fetchStatus}
                  className="flex items-center gap-1 hover:text-[var(--text-main)]"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh Status
                </button>
              </div>

              {showCustomUrl && (
                <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2 text-xs">
                  <label className="text-[11px] font-semibold text-[var(--text-muted)]">
                    Direct HTTPS Download URL for .task model:
                  </label>
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder={status?.defaultDownloadUrl}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-main)] focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Low-Level Direct Inference Verification Section (Section 6 of requirements) */}
          {isReady && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-300 m-0">Local AI Ready & Loaded</h3>
                    <p className="text-[11px] text-emerald-400/80 m-0">On-device inference runtime is active</p>
                  </div>
                </div>
                <button
                  onClick={handleDeleteModel}
                  title="Delete local model"
                  className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Direct Inference Tester */}
              <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-200">Direct Local Inference Test:</span>
                  {status?.lastInferenceTimeMs ? (
                    <span className="text-[11px] font-mono text-emerald-400">
                      Last latency: {status.lastInferenceTimeMs}ms
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleRunTest('Hello')}
                    disabled={isTestingInference}
                    className="px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    Test: &quot;Hello&quot;
                  </button>
                  <button
                    onClick={() => handleRunTest('What is React?')}
                    disabled={isTestingInference}
                    className="px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    Test: &quot;What is React?&quot;
                  </button>
                  <button
                    onClick={() => handleRunTest('Explain TypeScript in one sentence.')}
                    disabled={isTestingInference}
                    className="px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    Test: &quot;Explain TypeScript...&quot;
                  </button>
                </div>

                {isTestingInference && (
                  <div className="p-3 rounded-lg bg-black/40 border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-2 animate-pulse font-mono">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Executing on-device LLM inference ({testPrompt})...</span>
                  </div>
                )}

                {testResult && !isTestingInference && (
                  <div className="p-3 rounded-lg bg-black/50 border border-emerald-500/30 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-emerald-400 font-semibold">
                        Prompt: &quot;{testResult.prompt}&quot;
                      </span>
                      {testResult.elapsedMs && (
                        <span className="text-[var(--text-muted)]">{testResult.elapsedMs}ms</span>
                      )}
                    </div>
                    {testResult.success ? (
                      <div className="text-[var(--text-main)] text-xs leading-relaxed whitespace-pre-wrap font-sans bg-[var(--bg-surface)] p-2.5 rounded border border-[var(--border-subtle)]">
                        {testResult.response}
                      </div>
                    ) : (
                      <div className="text-rose-400 text-xs bg-rose-500/10 p-2 rounded border border-rose-500/20">
                        {testResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Foundry Standalone Android</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors"
          >
            {isReady ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
