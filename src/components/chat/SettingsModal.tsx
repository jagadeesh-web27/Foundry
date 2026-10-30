import React, { useState } from 'react';
import {
  Folder,
  RefreshCw,
  Cpu,
  Eye,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Check,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/stores/AppContext';
import { useTheme } from '@/stores/ThemeContext';
import { AIProviderType } from '@/types/ai';
import {
  permissionManager,
  DevicePermissionCategory,
  PermissionStatus,
  PERMISSION_CONFIGS,
} from '@/services/permissions/permissionManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    settings,
    updateSettings,
    aiStatus,
    checkAIStatus,
    accessibleDirs,
    connectComputer,
    isIndexing,
    stats,
  } = useApp();

  const {
    theme,
    setTheme,
    highContrast,
    setHighContrast,
    reducedMotion,
    setReducedMotion,
    fontSize,
    setFontSize,
  } = useTheme();

  const [aiForm, setAiForm] = useState(settings.ai);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Device permissions state
  const [permissions, setPermissions] = useState<Record<DevicePermissionCategory, PermissionStatus>>(() =>
    permissionManager.getAllPermissions()
  );

  const handlePermissionChange = (category: DevicePermissionCategory, status: PermissionStatus) => {
    permissionManager.setPermission(category, status);
    setPermissions(permissionManager.getAllPermissions());
  };

  const handleResetPermissions = () => {
    permissionManager.resetToDefaults();
    setPermissions(permissionManager.getAllPermissions());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({ ...settings, ai: aiForm });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    await checkAIStatus();
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch(`${aiForm.endpoint}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      }).catch(async () => {
        return fetch(`${aiForm.endpoint}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        }).catch(async () => {
          return fetch(`${aiForm.endpoint}/health`, {
            signal: AbortSignal.timeout(3000),
          }).catch(async () => {
            return fetch(`${aiForm.endpoint}/`, {
              signal: AbortSignal.timeout(3000),
            });
          });
        });
      });

      if (res.ok) {
        setTestResult({
          success: true,
          message: `Connected to ${aiForm.provider} at ${aiForm.endpoint}!`,
        });
      } else {
        setTestResult({
          success: false,
          message: `Endpoint reachable but returned status ${res.status}.`,
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: `Could not connect to ${aiForm.endpoint}. Ensure your AI server or proxy is active.`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Foundry Settings" maxWidth="max-w-2xl">
      <div className="space-y-6 text-xs">
        {/* Privacy Banner */}
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start space-x-2.5 text-emerald-400">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300">Local-First Security & Zero Unrestricted Access</p>
            <p className="text-[11px] text-emerald-400/90 mt-0.5">
              Foundry strictly enforces operating system security. The AI has zero shell/cmd execution privileges.
              Sensitive actions require explicit user confirmation.
            </p>
          </div>
        </div>

        {/* Section 1: Device Permissions Governance */}
        <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold text-[var(--text-main)] m-0">
                Device Capabilities & Permissions
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetPermissions}
              className="flex items-center space-x-1 text-[11px] text-[var(--text-faint)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              title="Reset all permissions to safe defaults"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <p className="text-[11px] text-[var(--text-faint)]">
            Configure how the AI agent interacts with your hardware, files, and applications.
          </p>

          <div className="space-y-2 pt-1">
            {(Object.keys(PERMISSION_CONFIGS) as DevicePermissionCategory[]).map((categoryKey) => {
              const cfg = PERMISSION_CONFIGS[categoryKey];
              const currentStatus = permissions[categoryKey] || cfg.defaultStatus;

              return (
                <div
                  key={categoryKey}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]"
                >
                  <div className="sm:pr-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--text-main)]">{cfg.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          cfg.type === 'ACTION'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {cfg.type === 'ACTION' ? 'Action' : 'Read only'}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-faint)] mt-0.5">{cfg.description}</div>
                  </div>

                  <div role="group" aria-label={`${cfg.name} permission`} className="grid grid-cols-3 sm:flex sm:items-center gap-1 bg-[var(--bg-tertiary)] p-0.5 rounded border border-[var(--border-subtle)] w-full sm:w-auto flex-shrink-0">
                    {(['allowed', 'ask', 'denied'] as PermissionStatus[]).map((status) => {
                      const isSelected = currentStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handlePermissionChange(categoryKey, status)}
                          aria-pressed={isSelected}
                          className={`min-h-[44px] sm:min-h-0 px-2 py-1 rounded text-[13px] sm:text-[10px] font-medium transition-colors capitalize cursor-pointer ${
                            isSelected
                              ? status === 'allowed'
                                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                                : status === 'ask'
                                ? 'bg-amber-600 text-white font-semibold shadow-xs'
                                : 'bg-rose-600 text-white font-semibold shadow-xs'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'
                          }`}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: AI Provider Engine */}
        <form onSubmit={handleSave} className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-semibold text-[var(--text-main)] m-0">Runtime AI Provider</h3>
            </div>
            <div className="flex items-center space-x-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  aiStatus.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                title={aiStatus.isAvailable ? 'Connected' : 'Offline'}
              />
              <span className="text-[10px] text-[var(--text-faint)]">
                {aiStatus.isAvailable ? 'Ready' : 'Checking'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Provider Engine</label>
              <select
                value={aiForm.provider}
                onChange={(e) => {
                  const val = e.target.value as AIProviderType;
                  if (val === 'cloud') {
                    setAiForm({
                      ...aiForm,
                      provider: val,
                      endpoint: 'https://api.foundry-ai.com/v1',
                      model: 'foundry-standard',
                    });
                  } else if (val === 'desktop_local') {
                    setAiForm({
                      ...aiForm,
                      provider: val,
                      endpoint: 'http://127.0.0.1:8172',
                      model: 'foundry-desktop-local-model',
                    });
                  } else if (val === 'anthropic_local') {
                    setAiForm({
                      ...aiForm,
                      provider: val,
                      endpoint: 'http://127.0.0.1:8082',
                      model: 'claude-3-5-sonnet-20241022',
                    });
                  } else if (val === 'lmstudio') {
                    setAiForm({
                      ...aiForm,
                      provider: val,
                      endpoint: 'http://127.0.0.1:1234',
                      model: 'local-model',
                    });
                  } else if (val === 'ollama') {
                    setAiForm({
                      ...aiForm,
                      provider: val,
                      endpoint: 'http://127.0.0.1:11434',
                      model: 'llama3:latest',
                    });
                  } else {
                    setAiForm({ ...aiForm, provider: val });
                  }
                }}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none text-xs"
              >
                <option value="desktop_local">Foundry On-Device AI (built in, offline)</option>
                <option value="cloud">Foundry Cloud Assistant (Zero Setup / Packaged)</option>
                <option value="anthropic_local">Local Runtime (Port 8082 / Anthropic API)</option>
                <option value="ollama">Ollama (Port 11434)</option>
                <option value="lmstudio">LM Studio (Port 1234)</option>
                <option value="llamacpp">llama.cpp server</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Endpoint URL</label>
              <input
                type="url"
                value={aiForm.endpoint}
                onChange={(e) => setAiForm({ ...aiForm, endpoint: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none text-xs font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Model Name</label>
              <input
                type="text"
                placeholder="foundry-standard or llama3"
                value={aiForm.model}
                onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Embedding Model</label>
              <input
                type="text"
                placeholder="nomic-embed-text:latest"
                value={aiForm.embeddingModel}
                onChange={(e) => setAiForm({ ...aiForm, embeddingModel: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={testingConnection}
              onClick={handleTestConnection}
            >
              Test Connection
            </Button>

            <Button type="submit" variant="primary" size="sm" icon={isSaved ? Check : Save}>
              {isSaved ? 'Saved' : 'Save AI Settings'}
            </Button>
          </div>

          {testResult && (
            <div
              className={`text-[11px] flex items-center space-x-1.5 pt-1 ${
                testResult.success ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </form>

        {/* Section 3: Computer File Locations */}
        <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Folder className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-semibold text-[var(--text-main)] m-0">
                Accessible Computer Directories
              </h3>
            </div>
            <button
              type="button"
              onClick={connectComputer}
              disabled={isIndexing}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isIndexing ? 'animate-spin' : ''}`} />
              <span>{isIndexing ? 'Re-indexing...' : 'Re-index Computer'}</span>
            </button>
          </div>

          <div className="text-[11px] text-[var(--text-faint)]">
            Total files indexed: <span className="font-semibold text-[var(--text-main)]">{stats.totalIndexedFiles.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {accessibleDirs.map((dir) => (
              <div
                key={dir.name}
                className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px]"
              >
                <div className="font-medium text-[var(--text-main)]">{dir.name}</div>
                <div className="text-[10px] text-[var(--text-faint)] truncate font-mono">{dir.path}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Accessibility */}
        <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center space-x-2 pb-1 border-b border-[var(--border-subtle)]">
            <Eye className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-semibold text-[var(--text-main)] m-0">
              Display & Accessibility (WCAG 2.2 AA)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'system' | 'dark' | 'light')}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none text-xs"
              >
                <option value="dark">Dark Theme (Default)</option>
                <option value="light">Light Theme</option>
                <option value="system">Follow System</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Font Size</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as 'normal' | 'large' | 'x-large')}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none text-xs"
              >
                <option value="normal">Normal (16px)</option>
                <option value="large">Large (18px)</option>
                <option value="x-large">Extra Large (20px)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[11px] font-medium text-[var(--text-main)]">High Contrast</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[11px] font-medium text-[var(--text-main)]">Reduced Motion</span>
            </label>
          </div>
        </div>

        {/* Section 5: Developer / Debug Mode */}
        <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 rounded bg-amber-500/10 text-amber-500">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-main)] m-0">Developer / Debug Mode</h3>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                  Inspect structured intent understanding, date filters, and tool calls in the conversation.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.developerMode || false}
                onChange={(e) => updateSettings({ ...settings, developerMode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[var(--border-subtle)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
};
