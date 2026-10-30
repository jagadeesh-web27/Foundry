import React, { useState } from 'react';
import {
  Cpu,
  HardDrive,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Check,
  Eye,
  Key,
} from 'lucide-react';
import { useApp } from '@/stores/AppContext';
import { useTheme } from '@/stores/ThemeContext';
import { AppSettings } from '@/types/settings';
import { AIProviderType } from '@/types/ai';
import { Button } from '@/components/ui/Button';
import {
  getStoredGoogleClientId,
  setStoredGoogleClientId,
} from '@/config/oauthConfig';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, aiStatus, checkAIStatus } = useApp();
  const { theme, setTheme, highContrast, setHighContrast, reducedMotion, setReducedMotion, fontSize, setFontSize } = useTheme();

  const [formData, setFormData] = useState<AppSettings>(settings);
  const [googleClientId, setGoogleClientIdState] = useState(getStoredGoogleClientId());
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoredGoogleClientId(googleClientId);
    await updateSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    await checkAIStatus();
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      // Temporarily test with current form values
      const res = await fetch(`${formData.ai.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      }).catch(async () => {
        // Fallback for OpenAI-compatible /v1/models endpoint
        return fetch(`${formData.ai.endpoint}/v1/models`, {
          signal: AbortSignal.timeout(3000),
        });
      });

      if (res.ok) {
        setTestResult({
          success: true,
          message: `Successfully connected to local provider at ${formData.ai.endpoint}!`,
        });
      } else {
        setTestResult({
          success: false,
          message: `Connected but server responded with status ${res.status}. Check model configuration.`,
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: `Could not reach provider at ${formData.ai.endpoint}. Ensure your local server is running.`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] m-0">Settings & Configuration</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Manage your local AI providers, indexing parameters, storage locations, and accessibility preferences.
          </p>
        </div>
      </div>

      {/* Privacy Notice Card */}
      <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-emerald-500/30 flex items-start space-x-3">
        <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <h3 className="font-semibold text-[var(--text-main)] m-0">Your Data Is Stored Locally</h3>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Foundry does not require cloud storage for core functionality. Your documents, notes, vectors, and knowledge graph stay on your physical device.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8 text-xs">
        {/* Section 1: AI Provider */}
        <div className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">Local AI Engine</h3>
            </div>
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  aiStatus.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px] text-[var(--text-faint)]">
                {aiStatus.isAvailable ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Provider Engine</label>
              <select
                value={formData.ai.provider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ai: { ...formData.ai, provider: e.target.value as AIProviderType },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              >
                <option value="ollama">Ollama (Default)</option>
                <option value="lmstudio">LM Studio (Local Server)</option>
                <option value="llamacpp">llama.cpp server</option>
                <option value="custom">Custom Local OpenAI Compatible API</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Local Endpoint URL</label>
              <input
                type="url"
                value={formData.ai.endpoint}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ai: { ...formData.ai, endpoint: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Chat & RAG Model</label>
              <input
                type="text"
                placeholder="e.g. llama3:latest or mistral:latest"
                value={formData.ai.model}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ai: { ...formData.ai, model: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Embedding Model</label>
              <input
                type="text"
                placeholder="e.g. nomic-embed-text:latest"
                value={formData.ai.embeddingModel}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ai: { ...formData.ai, embeddingModel: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={testingConnection}
              onClick={handleTestConnection}
            >
              Test Connection
            </Button>
            {testResult && (
              <div
                className={`text-[11px] flex items-center space-x-1.5 ${
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
          </div>
        </div>

        {/* Section 2: Indexing Settings */}
        <div className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-[var(--border-subtle)]">
            <Sliders className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">Deterministic Indexing</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">
                Chunk Size (words)
              </label>
              <input
                type="number"
                min={64}
                max={2048}
                value={formData.indexing.chunkSize}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    indexing: { ...formData.indexing, chunkSize: parseInt(e.target.value) || 512 },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-faint)] mt-0.5 block">
                Standard: 512 words (~650 tokens)
              </span>
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">
                Chunk Overlap (words)
              </label>
              <input
                type="number"
                min={0}
                max={512}
                value={formData.indexing.chunkOverlap}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    indexing: { ...formData.indexing, chunkOverlap: parseInt(e.target.value) || 64 },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-faint)] mt-0.5 block">
                Standard: 64 words to preserve cross-boundary context
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Storage Paths */}
        <div className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-[var(--border-subtle)]">
            <HardDrive className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">Local Storage Directories</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Database Location</label>
              <input
                type="text"
                value={formData.storage.databasePath}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    storage: { ...formData.storage, databasePath: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Vectors Directory</label>
              <input
                type="text"
                value={formData.storage.vectorsPath}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    storage: { ...formData.storage, vectorsPath: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-[11px]"
              />
            </div>
          </div>
        </div>

        {/* Section: OAuth Integrations */}
        <div className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-[var(--border-subtle)]">
            <Key className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">OAuth Integrations</h3>
          </div>
          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Google OAuth Client ID</label>
            <input
              type="text"
              placeholder="e.g. 123456789.apps.googleusercontent.com"
              value={googleClientId}
              onChange={(e) => setGoogleClientIdState(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-[11px]"
            />
            <span className="text-[10px] text-[var(--text-faint)] mt-0.5 block">
              Used for desktop OAuth sign-in to Gmail and Google Calendar.
            </span>
          </div>
        </div>

        {/* Section 4: Accessibility (WCAG 2.2 AA) */}
        <div className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-[var(--border-subtle)]">
            <Eye className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">
              Accessibility & Display (WCAG 2.2 AA)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Color Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'system' | 'dark' | 'light')}
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              >
                <option value="dark">Dark Theme (Default)</option>
                <option value="light">Light Theme</option>
                <option value="system">Follow System Theme</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[var(--text-main)] mb-1">Font Size</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as 'normal' | 'large' | 'x-large')}
                className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              >
                <option value="normal">Default (16px)</option>
                <option value="large">Large (18px)</option>
                <option value="x-large">Extra Large (20px)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-[var(--text-main)]">High Contrast Mode</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-[var(--text-main)]">Reduced Motion (WCAG 2.3.3)</span>
            </label>
          </div>
        </div>

        
        {/* Save Bar */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[var(--border-subtle)]">
          <Button type="submit" variant="primary" size="md" icon={isSaved ? Check : Save}>
            {isSaved ? 'Settings Saved' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
};
