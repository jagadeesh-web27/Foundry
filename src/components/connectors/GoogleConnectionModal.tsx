import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  Calendar,
  Copy,
  Check,
  Globe,
  Sparkles,
} from 'lucide-react';
import { connectorRegistry } from '@/services/connectors/core/connectorRegistry';
import {
  getStoredGoogleClientId,
  setStoredGoogleClientId,
} from '@/config/oauthConfig';

interface GoogleConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onStartOAuth: (connectorId: string) => void;
  targetConnectorId?: string;
}

export const GoogleConnectionModal: React.FC<GoogleConnectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onStartOAuth,
  targetConnectorId = 'google_gmail',
}) => {
  const [activeTab, setActiveTab] = useState<'token' | 'client_id'>('token');

  // Token tab state
  const [accessToken, setAccessToken] = useState('');
  const [connectGmail, setConnectGmail] = useState(true);
  const [connectCalendar, setConnectCalendar] = useState(true);
  const [isTokenConnecting, setIsTokenConnecting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copiedScopes, setCopiedScopes] = useState(false);

  // Client ID tab state
  const [clientId, setClientId] = useState('');
  const [clientIdSaved, setClientIdSaved] = useState(false);
  const [clientIdError, setClientIdError] = useState<string | null>(null);

  const defaultScopesString =
    'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setClientId(getStoredGoogleClientId());
      setTokenError(null);
      setClientIdError(null);
      setClientIdSaved(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyScopes = async () => {
    try {
      await navigator.clipboard.writeText(defaultScopesString);
      setCopiedScopes(true);
      setTimeout(() => setCopiedScopes(false), 2000);
    } catch (e) {
      console.error('Failed to copy scopes', e);
    }
  };

  const handleOpenPlayground = async () => {
    const url = 'https://developers.google.com/oauthplayground/';
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_browser_url', { url });
        return;
      } catch {}
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenCloudConsole = async () => {
    const url = 'https://console.cloud.google.com/apis/credentials';
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_browser_url', { url });
        return;
      } catch {}
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Connect using direct Access Token (Google Playground or other token generator)
  const handleConnectWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = accessToken.trim();
    if (!cleanToken) {
      setTokenError('Please paste an access token.');
      return;
    }

    setIsTokenConnecting(true);
    setTokenError(null);

    const connectorsToConnect: string[] = [];
    if (connectGmail) connectorsToConnect.push('google_gmail');
    if (connectCalendar) connectorsToConnect.push('google_calendar');

    if (connectorsToConnect.length === 0) {
      setTokenError('Please select at least one Google service to connect.');
      setIsTokenConnecting(false);
      return;
    }

    try {
      let connectedEmail = '';
      const connectedNames: string[] = [];

      for (const id of connectorsToConnect) {
        const connector = connectorRegistry.getConnector(id);
        if (!connector) continue;

        const success = await connector.connect(cleanToken);
        if (!success) {
          const v = await connector.verifyConnection();
          throw new Error(v.error || `Failed to verify token for ${connector.name}.`);
        }

        const cfg = await connector.getConfig();
        if (cfg.accountEmail) connectedEmail = cfg.accountEmail;
        connectedNames.push(connector.name);
      }

      onSuccess(
        `Successfully connected ${connectedNames.join(' and ')}${
          connectedEmail ? ` (${connectedEmail})` : ''
        }!`
      );
      onClose();
    } catch (err: any) {
      console.error('Token connection error:', err);
      setTokenError(
        err?.message ||
          'Failed to verify token. Make sure the token is valid and not expired.'
      );
    } finally {
      setIsTokenConnecting(false);
    }
  };

  // Save Client ID and trigger official browser OAuth PKCE sign in
  const handleSaveAndStartOAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = clientId.trim();
    if (!cleanId) {
      setClientIdError('Please enter a Google OAuth Client ID.');
      return;
    }

    if (!cleanId.includes('.apps.googleusercontent.com')) {
      setClientIdError(
        'Google Client IDs typically end with ".apps.googleusercontent.com". Please check your credentials.'
      );
      return;
    }

    setStoredGoogleClientId(cleanId);
    setClientIdSaved(true);
    setClientIdError(null);

    // Launch official OAuth flow
    onClose();
    onStartOAuth(targetConnectorId);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-modal-title"
    >
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Mail className="w-5 h-5" aria-hidden="true" focusable="false" />
            </div>
            <div>
              <h2 id="google-modal-title" className="text-base font-bold text-[var(--text-main)] m-0">
                Connect Google Account
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                Choose how you want to authorize Gmail and Google Calendar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" aria-hidden="true" focusable="false" />
          </button>
        </div>

        {/* Method Tabs */}
        <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 px-5 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('token')}
            className={`pb-2.5 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'token'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Instant Browser Token (No Setup)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('client_id')}
            className={`pb-2.5 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'client_id'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Key className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Google Client ID (Permanent)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'token' ? (
            <form onSubmit={handleConnectWithToken} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-2">
                <div className="font-semibold flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" focusable="false" />
                  <span>Connect directly from browser in 30 seconds</span>
                </div>
                <p className="text-[11px] leading-relaxed text-blue-200/90 m-0">
                  You don't need to configure Google Cloud projects or Client IDs. Generate a personal token directly through Google's official playground and paste it below.
                </p>
              </div>

              {/* Step by step guide */}
              <div className="space-y-2.5 text-[var(--text-muted)] bg-[var(--bg-tertiary)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                <span className="font-bold text-[var(--text-main)] block text-xs">
                  Quick Steps:
                </span>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] leading-relaxed">
                  <li>
                    Open{' '}
                    <button
                      type="button"
                      onClick={handleOpenPlayground}
                      className="text-blue-400 underline font-semibold hover:text-blue-300 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      Google OAuth Playground
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>{' '}
                    in your browser.
                  </li>
                  <li>
                    Under Step 1, select <strong>Gmail API v1</strong> (<code>gmail.readonly</code>) and <strong>Google Calendar API v3</strong> (<code>calendar.readonly</code>), or paste the scopes below:
                  </li>
                </ol>

                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-faint)] truncate">
                    {defaultScopesString}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyScopes}
                    className="px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-secondary)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] flex items-center gap-1 cursor-pointer shrink-0"
                    title="Copy scopes to clipboard"
                  >
                    {copiedScopes ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <ol start={3} className="list-decimal list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
                  <li>Click <strong>Authorize APIs</strong> and approve with your Google account.</li>
                  <li>Click <strong>Exchange authorization code for tokens</strong>.</li>
                  <li>Copy the <strong>Access token</strong> string (starts with <code>ya29.</code>) and paste it below.</li>
                </ol>
              </div>

              {/* Token Input */}
              <div className="space-y-1.5">
                <label className="block font-medium text-[var(--text-main)]">
                  Google Access Token
                </label>
                <textarea
                  rows={3}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Paste your ya29.a0... access token here"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Service Selection */}
              <div className="space-y-1.5 pt-1">
                <span className="block font-medium text-[var(--text-main)] text-xs">
                  Apply Access Token to:
                </span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      checked={connectGmail}
                      onChange={(e) => setConnectGmail(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <Mail className="w-3.5 h-3.5 text-red-400" />
                    <span>Gmail</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      checked={connectCalendar}
                      onChange={(e) => setConnectCalendar(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <Calendar className="w-3.5 h-3.5 text-yellow-400" />
                    <span>Google Calendar</span>
                  </label>
                </div>
              </div>

              {/* Token Error */}
              {tokenError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{tokenError}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTokenConnecting || !accessToken.trim()}
                  className="px-5 py-2 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/10"
                >
                  {isTokenConnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying Token...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Connect with Access Token</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveAndStartOAuth} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)] space-y-2">
                <div className="font-semibold text-[var(--text-main)] flex items-center justify-between">
                  <span>Permanent OAuth 2.0 Sign-In</span>
                  <button
                    type="button"
                    onClick={handleOpenCloudConsole}
                    className="text-blue-400 hover:text-blue-300 text-[11px] underline flex items-center gap-1 cursor-pointer"
                  >
                    Google Cloud Console
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed m-0">
                  Enter your Google Cloud OAuth Client ID below. Foundry saves this locally in your browser so you can sign in directly through your browser with automatic background token refreshes.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-[var(--text-main)]">
                  Google OAuth Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 1234567890-abcdef...apps.googleusercontent.com"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs focus:outline-none focus:border-blue-500"
                  required
                />
                <span className="text-[10px] text-[var(--text-faint)] block">
                  Created as <strong>Desktop app</strong> in Google Cloud Console.
                </span>
              </div>

              {clientIdError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{clientIdError}</span>
                </div>
              )}

              {clientIdSaved && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Client ID saved locally. Opening browser login...</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!clientId.trim()}
                  className="px-5 py-2 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/10"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Save & Sign in via Browser</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
