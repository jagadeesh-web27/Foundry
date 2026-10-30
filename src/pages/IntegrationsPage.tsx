import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  Clock,
  Info,
  X,
  AlertTriangle,
  Lock,
  ExternalLink,
  Key,
} from 'lucide-react';
import { connectorRegistry } from '@/services/connectors/core/connectorRegistry';
import { syncManager } from '@/services/connectors/core/syncManager';
import { StoredConnectorConfig } from '@/services/db/database';
import { DataDiagnosticsModal } from '@/components/diagnostics/DataDiagnosticsModal';
import {
  ConnectionVerificationModal,
  ProviderVerificationReport,
} from '@/components/diagnostics/ConnectionVerificationModal';
import { OAUTH_CONFIG, isGoogleOAuthReady } from '@/config/oauthConfig';
import { GoogleConnectionModal } from '@/components/connectors/GoogleConnectionModal';

type IntegrationCategory = 'all' | 'work' | 'communication' | 'productivity' | 'storage';

interface ServiceStatus {
  key: string;
  name: string;
  verified: boolean;
  statusText: string;
}

interface ProviderCardSpec {
  id: string;
  displayName: string;
  provider: string;
  category: 'work' | 'communication' | 'productivity' | 'storage';
  icon: React.ReactNode;
  capabilities: { key: string; label: string; isAction?: boolean }[];
  notice?: string;
  isAvailable?: boolean;
  connectButtonText?: string;
  servicesBreakdown?: (cfg: StoredConnectorConfig | undefined) => ServiceStatus[];
}

export const IntegrationsPage: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('all');
  const [configs, setConfigs] = useState<Record<string, StoredConnectorConfig>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');

  // Official Browser OAuth Connection Modal State
  const [activeConnectingId, setActiveConnectingId] = useState<string | null>(null);
  const [connectingState, setConnectingState] = useState<'opening_browser' | 'awaiting_consent' | 'verifying' | 'error' | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Diagnostics modals
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isMicrosoftDiagOpen, setIsMicrosoftDiagOpen] = useState(false);

  // Live Connection Verification modal
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [verificationReports, setVerificationReports] = useState<ProviderVerificationReport[]>([]);
  const [verificationCompletedAt, setVerificationCompletedAt] = useState<string | undefined>();

  // In-App Google Connection Modal (Direct Token or Custom Client ID)
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleModalTargetConnector, setGoogleModalTargetConnector] = useState('google_gmail');

  const loadConfigs = useCallback(async () => {
    try {
      const allConnectors = connectorRegistry.getAllConnectors();
      const cfgMap: Record<string, StoredConnectorConfig> = {};
      for (const c of allConnectors) {
        cfgMap[c.id] = await c.getConfig();
      }
      setConfigs(cfgMap);
    } catch (e) {
      console.error('Failed to load connector configs:', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const allConnectors = connectorRegistry.getAllConnectors();
        const cfgMap: Record<string, StoredConnectorConfig> = {};
        for (const c of allConnectors) {
          cfgMap[c.id] = await c.getConfig();
        }
        if (!cancelled) {
          setConfigs(cfgMap);
        }
      } catch (e) {
        console.error('Failed to load connector configs:', e);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleCapability = async (connectorId: string, cap: string, isAction: boolean) => {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) return;
    const current = configs[connectorId];
    if (!current) return;

    if (isAction) {
      const nextActions = {
        ...current.actionPermissions,
        [cap]: !current.actionPermissions[cap],
      };
      const updated = await connector.updateConfig({ actionPermissions: nextActions });
      setConfigs((prev) => ({ ...prev, [connectorId]: updated }));
    } else {
      const granted = current.grantedCapabilities.includes(cap)
        ? current.grantedCapabilities.filter((c) => c !== cap)
        : [...current.grantedCapabilities, cap];
      const updated = await connector.updateConfig({ grantedCapabilities: granted });
      setConfigs((prev) => ({ ...prev, [connectorId]: updated }));
    }
  };

  /**
   * Initiates official browser-based OAuth authorization flow.
   * If Google is not yet configured with a valid Client ID, opens the In-App Setup modal.
   */
  const handleStartOAuthConnect = async (connectorId: string) => {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) return;

    // Route unconfigured Google requests to the in-app credentials modal
    if (connectorId.startsWith('google') && !isGoogleOAuthReady()) {
      setGoogleModalTargetConnector(connectorId);
      setIsGoogleModalOpen(true);
      return;
    }

    setActiveConnectingId(connectorId);
    setConnectingState('opening_browser');
    setConnectError(null);

    try {
      setConnectingState('awaiting_consent');
      // Invokes browser flow via connector -> OAuthProvider -> PKCE -> Loopback listener
      const success = await connector.connect();

      if (!success) {
        const v = await connector.verifyConnection();
        throw new Error(v.error || 'Connection or authorization was not completed.');
      }

      setConnectingState('verifying');
      setStatusMessage(`${connector.name} connected and verified successfully.`);
      setStatusType('success');
      setActiveConnectingId(null);
      setConnectingState(null);
      await loadConfigs();

      // Trigger automatic initial synchronization
      syncManager.syncConnector(connector, true).then(() => {
        loadConfigs();
      });
    } catch (err: any) {
      console.error('OAuth connection error:', err);
      setConnectError(err?.message || 'Authentication flow failed or was cancelled.');
      setConnectingState('error');
    }
  };

  const handleVerifySingle = async (connectorId: string) => {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) return;

    setIsVerifyingAll(true);
    setIsVerificationModalOpen(true);

    try {
      const isConn = await connector.isConnected();
      const vResult = await connector.verifyConnection();
      setVerificationReports([
        {
          connectorId: connector.id,
          name: connector.name,
          provider: connector.provider,
          connected: isConn,
          result: vResult,
        },
      ]);
      setVerificationCompletedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch (err) {
      console.error('Verification error:', err);
    } finally {
      setIsVerifyingAll(false);
    }
  };

  const handleSyncNow = async (connectorId: string) => {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) return;

    setSyncingId(connectorId);
    setStatusMessage(`Synchronizing ${connector.name}...`);
    setStatusType('info');
    try {
      const res = await syncManager.syncConnector(connector, true);
      if (res.success) {
        setStatusMessage(`Successfully synchronized ${connector.name} (${res.itemsCount} records analyzed).`);
        setStatusType('success');
      } else {
        setStatusMessage(`Sync error for ${connector.name}: ${res.error || 'Failed'}`);
        setStatusType('error');
      }
      await loadConfigs();
    } catch (err: any) {
      setStatusMessage(`Error syncing ${connector.name}: ${err?.message || String(err)}`);
      setStatusType('error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    setStatusMessage('Syncing all authorized integrations...');
    setStatusType('info');

    try {
      const allConnectors = connectorRegistry.getAllConnectors();
      const results = await syncManager.syncAll(allConnectors);
      let totalRecords = 0;
      let successCount = 0;

      for (const res of Object.values(results)) {
        if (res.success) {
          successCount++;
          totalRecords += res.itemsCount;
        }
      }

      setStatusMessage(
        `Sync All completed: ${successCount} services updated, ${totalRecords} records retrieved and analyzed by CommitmentEngine.`
      );
      setStatusType('success');
      await loadConfigs();
    } catch (err: any) {
      setStatusMessage(`Sync All encountered an error: ${err?.message || String(err)}`);
      setStatusType('error');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleVerifyAll = async () => {
    setIsVerifyingAll(true);
    setIsVerificationModalOpen(true);

    try {
      const allConnectors = connectorRegistry.getAllConnectors();
      const reports: ProviderVerificationReport[] = [];

      for (const connector of allConnectors) {
        const isConn = await connector.isConnected();
        const vResult = await connector.verifyConnection();
        reports.push({
          connectorId: connector.id,
          name: connector.name,
          provider: connector.provider,
          connected: isConn,
          result: vResult,
        });
      }

      setVerificationReports(reports);
      setVerificationCompletedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch (err) {
      console.error('Verification error:', err);
    } finally {
      setIsVerifyingAll(false);
    }
  };

  const handleDisconnect = async (connectorId: string) => {
    const connector = connectorRegistry.getConnector(connectorId);
    if (!connector) return;

    await connector.disconnect();
    setStatusMessage(`${connector.name} disconnected. Stored tokens securely deleted.`);
    setStatusType('info');
    await loadConfigs();
  };

  // Provider Catalog Specs Conforming to Section 2, 17, 18
  const providerSpecs: ProviderCardSpec[] = [
    // Work
    {
      id: 'microsoft_outlook',
      displayName: 'Microsoft',
      provider: 'Microsoft 365',
      category: 'work',
      icon: <Mail className="w-5 h-5 text-blue-400" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Microsoft',
      capabilities: [
        { key: 'READ_EMAIL', label: 'Read Email' },
        { key: 'READ_CALENDAR', label: 'Read Calendar' },
        { key: 'READ_ATTACHMENTS', label: 'Read Attachments' },
        { key: 'SEARCH_MESSAGES', label: 'Search Messages' },
        { key: 'SEND_EMAIL', label: 'Send Email (Confirmation required)', isAction: true },
      ],
      servicesBreakdown: (cfg) => [
        { key: 'outlook', name: 'Outlook', verified: !!cfg?.connected, statusText: 'Read email' },
        {
          key: 'teams',
          name: 'Teams',
          verified: !!cfg?.connected,
          statusText: cfg?.connected ? 'Read messages' : 'Not configured',
        },
        { key: 'calendar', name: 'Calendar', verified: !!cfg?.connected, statusText: 'Read calendar' },
      ],
      isAvailable: true,
    },
    {
      id: 'google_gmail',
      displayName: 'Google',
      provider: 'Google Workspace',
      category: 'work',
      icon: <Mail className="w-5 h-5 text-red-400" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Google',
      capabilities: [
        { key: 'READ_EMAIL', label: 'Read Email (gmail.readonly)' },
        { key: 'SEARCH_MESSAGES', label: 'Search Messages' },
        { key: 'READ_ATTACHMENTS', label: 'Read Attachments' },
        { key: 'SEND_EMAIL', label: 'Send Email (Confirmation required)', isAction: true },
      ],
      servicesBreakdown: (cfg) => [
        { key: 'gmail', name: 'Gmail', verified: !!cfg?.connected, statusText: 'Read email' },
        { key: 'calendar', name: 'Calendar', verified: !!cfg?.connected, statusText: 'Read calendar' },
        { key: 'drive', name: 'Drive', verified: false, statusText: 'Not connected' },
      ],
      isAvailable: true,
    },
    {
      id: 'slack_workspace',
      displayName: 'Slack',
      provider: 'Slack',
      category: 'work',
      icon: <MessageSquare className="w-5 h-5 text-purple-400" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Slack',
      capabilities: [
        { key: 'READ_MESSAGES', label: 'Read Channels & Messages' },
        { key: 'SEARCH_MESSAGES', label: 'Search History' },
        { key: 'SEND_MESSAGE', label: 'Send Slack Message (Confirmation required)', isAction: true },
      ],
      servicesBreakdown: (cfg) => [
        { key: 'messages', name: 'Read messages', verified: !!cfg?.connected, statusText: 'Channels & DMs' },
      ],
      isAvailable: true,
    },
    {
      id: 'microsoft_teams',
      displayName: 'Microsoft Teams',
      provider: 'Microsoft 365',
      category: 'work',
      icon: <MessageSquare className="w-5 h-5 text-indigo-400" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Teams',
      capabilities: [
        { key: 'READ_MESSAGES', label: 'Read Messages & Chats' },
        { key: 'SEARCH_MESSAGES', label: 'Search Conversations' },
        { key: 'SEND_MESSAGE', label: 'Send Teams Message (Confirmation required)', isAction: true },
      ],
      notice: 'Requires Microsoft 365 cloud chat authorization. Does not extract from local Teams desktop cache.',
      isAvailable: true,
    },
    {
      id: 'google_chat',
      displayName: 'Google Chat',
      provider: 'Google Workspace',
      category: 'work',
      icon: <MessageSquare className="w-5 h-5 text-emerald-400" aria-hidden="true" focusable="false" />,
      capabilities: [
        { key: 'READ_MESSAGES', label: 'Read Workspace Spaces' },
        { key: 'SEARCH_MESSAGES', label: 'Search Chat Messages' },
      ],
      notice: 'Available for Google Workspace accounts with Chat API enabled. Consumer @gmail.com accounts will display limitation notice.',
      isAvailable: true,
    },

    // Communication
    {
      id: 'whatsapp_business',
      displayName: 'WhatsApp',
      provider: 'Meta',
      category: 'communication',
      icon: <MessageSquare className="w-5 h-5 text-emerald-500" aria-hidden="true" focusable="false" />,
      capabilities: [
        { key: 'READ_MESSAGES', label: 'Meta Cloud API Inbound' },
        { key: 'SEND_MESSAGE', label: 'Meta Cloud API Outbound', isAction: true },
      ],
      notice:
        'Personal chat analysis unavailable\n\nThe official WhatsApp integration does not provide the required personal-chat access for this account.\n\nFoundry will not access WhatsApp through scraping or private application data.',
      isAvailable: true,
    },
    {
      id: 'telegram_bot',
      displayName: 'Telegram',
      provider: 'Telegram',
      category: 'communication',
      icon: <MessageSquare className="w-5 h-5 text-sky-400" aria-hidden="true" focusable="false" />,
      capabilities: [
        { key: 'READ_MESSAGES', label: 'Official Bot Messages' },
        { key: 'SEND_MESSAGE', label: 'Bot Responses', isAction: true },
      ],
      notice:
        'Not available for personal-message analysis with the current connector.\n\nOnly official Bot API interactions are supported.',
      isAvailable: true,
    },
    {
      id: 'discord_workspace',
      displayName: 'Discord',
      provider: 'Discord',
      category: 'communication',
      icon: <MessageSquare className="w-5 h-5 text-indigo-300" aria-hidden="true" focusable="false" />,
      capabilities: [{ key: 'READ_MESSAGES', label: 'Guild & Channel Messages' }],
      isAvailable: false,
    },

    // Productivity
    {
      id: 'google_calendar',
      displayName: 'Google Calendar',
      provider: 'Google Workspace',
      category: 'productivity',
      icon: <Calendar className="w-5 h-5 text-yellow-400" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Google Calendar',
      capabilities: [
        { key: 'READ_CALENDAR', label: 'Read Calendar Events' },
        { key: 'CREATE_EVENT', label: 'Create Event (Confirmation required)', isAction: true },
      ],
      isAvailable: true,
    },
    {
      id: 'microsoft_calendar',
      displayName: 'Microsoft Calendar',
      provider: 'Microsoft 365',
      category: 'productivity',
      icon: <Calendar className="w-5 h-5 text-blue-300" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Microsoft Calendar',
      capabilities: [
        { key: 'READ_CALENDAR', label: 'Read Calendar Events' },
        { key: 'CREATE_EVENT', label: 'Create Event (Confirmation required)', isAction: true },
      ],
      isAvailable: true,
    },
    {
      id: 'notion_workspace',
      displayName: 'Notion',
      provider: 'Notion Labs',
      category: 'productivity',
      icon: <FileText className="w-5 h-5 text-gray-300" aria-hidden="true" focusable="false" />,
      capabilities: [{ key: 'READ_FILES', label: 'Read Databases & Pages' }],
      isAvailable: false,
    },

    // Storage
    {
      id: 'microsoft_onedrive',
      displayName: 'OneDrive',
      provider: 'Microsoft 365',
      category: 'storage',
      icon: <FileText className="w-5 h-5 text-blue-500" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect OneDrive',
      capabilities: [
        { key: 'READ_FILES', label: 'Search Documents' },
        { key: 'READ_ATTACHMENTS', label: 'Read File Metadata' },
      ],
      isAvailable: true,
    },
    {
      id: 'google_drive',
      displayName: 'Google Drive',
      provider: 'Google Workspace',
      category: 'storage',
      icon: <FileText className="w-5 h-5 text-emerald-400" aria-hidden="true" focusable="false" />,
      connectButtonText: 'Connect Google Drive',
      capabilities: [
        { key: 'READ_FILES', label: 'Search Drive Files' },
        { key: 'READ_ATTACHMENTS', label: 'Read File Metadata' },
      ],
      isAvailable: true,
    },
  ];

  const filteredSpecs = providerSpecs.filter(
    (spec) => activeCategory === 'all' || spec.category === activeCategory
  );

  const renderCard = (spec: ProviderCardSpec) => {
    const cfg = configs[spec.id];
    const isConnected = !!cfg?.connected;
    const isSyncing = syncingId === spec.id;
    const hasSyncError = cfg?.syncStatus === 'error';

    return (
      <div
        key={spec.id}
        className={`flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 ${
          isConnected
            ? 'bg-[var(--bg-secondary)] border-emerald-500/30 shadow-md shadow-emerald-500/5'
            : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)] hover:border-blue-500/30'
        }`}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] shrink-0">
                {spec.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-main)] truncate m-0">{spec.displayName}</h3>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--text-faint)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full shrink-0">
                      Disconnected
                    </span>
                  )}
                </div>

                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 m-0">
                  {isConnected && cfg.accountEmail ? (
                    <span className="text-blue-300 font-mono text-[11px]">{cfg.accountEmail}</span>
                  ) : isConnected && cfg.accountName ? (
                    <span className="text-[var(--text-main)] font-medium">{cfg.accountName}</span>
                  ) : (
                    `Connect your ${spec.displayName} account`
                  )}
                </p>
              </div>
            </div>

            {/* Top Action / Disconnect */}
            {isConnected && (
              <button
                type="button"
                onClick={() => handleDisconnect(spec.id)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer shrink-0"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Connected Services Breakdown (Section 17) */}
          {isConnected && spec.servicesBreakdown && (
            <div className="p-3 rounded-xl bg-[var(--bg-tertiary)]/60 border border-[var(--border-subtle)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--text-main)] uppercase tracking-wider text-[var(--text-muted)]">
                Services
              </div>
              <div className="space-y-1.5">
                {spec.servicesBreakdown(cfg).map((srv) => (
                  <div key={srv.key} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-main)] font-medium">{srv.name}</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                      {srv.statusText}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notices / Unsupported Limitations */}
          {spec.notice && !isConnected && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" focusable="false" />
              <span className="leading-relaxed whitespace-pre-line">{spec.notice}</span>
            </div>
          )}

          {/* Sync Status Error */}
          {hasSyncError && cfg?.syncErrorMessage && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" focusable="false" />
              <span className="truncate">{cfg.syncErrorMessage}</span>
            </div>
          )}

          {/* Permission Center Matrix */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-main)] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" focusable="false" />
                Permissions
              </span>
              <span className="text-[10px] text-[var(--text-faint)]">
                {isConnected ? 'Active' : 'Read-only by default'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {spec.capabilities.map((cap) => {
                const isEnabled = cap.isAction
                  ? !!cfg?.actionPermissions?.[cap.key]
                  : cfg?.grantedCapabilities?.includes(cap.key) ?? !cap.isAction;

                return (
                  <div
                    key={cap.key}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {cap.isAction ? (
                        <Lock className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" focusable="false" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden="true" focusable="false" />
                      )}
                      <span className="text-[11px] text-[var(--text-main)] truncate">{cap.label}</span>
                    </div>

                    {isConnected && spec.isAvailable && (
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleToggleCapability(spec.id, cap.key, !!cap.isAction)}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-gray-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Last verified sync */}
          {cfg?.lastSyncAt && (
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)] pt-1">
              <Clock className="w-3 h-3" aria-hidden="true" focusable="false" />
              <span>Last verified: {new Date(cfg.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => handleVerifySingle(spec.id)}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-main)] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" focusable="false" />
                <span>Verify Connection</span>
              </button>

              <button
                type="button"
                onClick={() => handleSyncNow(spec.id)}
                disabled={isSyncing}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" focusable="false" />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>

              {spec.id === 'microsoft_outlook' && (
                <button
                  type="button"
                  onClick={() => setIsMicrosoftDiagOpen(true)}
                  className="p-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-blue-400 transition-colors cursor-pointer shrink-0"
                  title="Microsoft Connection Diagnostics"
                  aria-label="Open Microsoft Connection Diagnostics"
                >
                  <Info className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                </button>
              )}

              {(spec.id === 'google_gmail' || spec.id === 'google_calendar') && (
                <button
                  type="button"
                  onClick={() => {
                    setGoogleModalTargetConnector(spec.id);
                    setIsGoogleModalOpen(true);
                  }}
                  className="p-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer shrink-0"
                  title="Configure Google Credentials or Token"
                  aria-label="Configure Google Credentials"
                >
                  <Key className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                </button>
              )}
            </div>
          ) : spec.isAvailable && !spec.notice?.includes('Personal chat analysis unavailable') && !spec.notice?.includes('Not available for personal-message analysis') ? (
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => handleStartOAuthConnect(spec.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/10 transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                <span>{spec.connectButtonText || `Connect ${spec.displayName}`}</span>
              </button>
              {spec.id === 'microsoft_outlook' && (
                <button
                  type="button"
                  onClick={() => setIsMicrosoftDiagOpen(true)}
                  className="p-2 rounded-xl text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-blue-400 transition-colors cursor-pointer shrink-0"
                  title="Microsoft Connection Diagnostics"
                  aria-label="Open Microsoft Connection Diagnostics"
                >
                  <Info className="w-4 h-4" aria-hidden="true" focusable="false" />
                </button>
              )}
              {(spec.id === 'google_gmail' || spec.id === 'google_calendar') && (
                <button
                  type="button"
                  onClick={() => {
                    setGoogleModalTargetConnector(spec.id);
                    setIsGoogleModalOpen(true);
                  }}
                  className="p-2 rounded-xl text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer shrink-0"
                  title="Configure Google Credentials or Token"
                  aria-label="Configure Google Credentials"
                >
                  <Key className="w-4 h-4" aria-hidden="true" focusable="false" />
                </button>
              )}
            </div>
          ) : (
            <div className="w-full text-center py-1">
              <span className="text-[11px] text-[var(--text-faint)] italic">
                {spec.notice ? 'Limitation Policy Enforced' : 'Available in Future Release'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const connectingConnector = activeConnectingId
    ? connectorRegistry.getConnector(activeConnectingId)
    : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 m-0">
            <Link2 className="w-6 h-6 text-blue-400" aria-hidden="true" focusable="false" />
            Integrations & Connectors
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1 m-0">
            Connect using official browser login and consent flows. No API keys or secrets required.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleVerifyAll}
            disabled={isVerifyingAll}
            aria-label="Verify All Connections"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium transition-colors cursor-pointer"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isVerifyingAll ? 'animate-spin' : ''}`} aria-hidden="true" focusable="false" />
            <span>{isVerifyingAll ? 'Verifying...' : 'Verify All Connections'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={isSyncingAll}
            aria-label="Sync All Authorized Services"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} aria-hidden="true" focusable="false" />
            <span>{isSyncingAll ? 'Syncing...' : 'Sync All'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            aria-label="View Diagnostics"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-subtle)] font-medium transition-colors cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Diagnostics</span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-fade-in ${
            statusType === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : statusType === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
          }`}
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 hover:opacity-80 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--border-subtle)] text-xs">
        {(['all', 'work', 'communication', 'productivity', 'storage'] as IntegrationCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3.5 py-1.5 rounded-lg font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSpecs.map(renderCard)}
      </div>

      {/* Official Browser OAuth Connecting Modal */}
      {activeConnectingId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oauth-modal-title"
        >
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
              <ExternalLink className="w-6 h-6 animate-pulse" aria-hidden="true" focusable="false" />
            </div>

            <div className="space-y-1">
              <h3 id="oauth-modal-title" className="text-base font-bold text-[var(--text-main)] m-0">
                Authorizing {connectingConnector?.name}
              </h3>
              <p className="text-xs text-[var(--text-muted)] m-0 leading-relaxed">
                Foundry has launched the official {connectingConnector?.provider} sign-in and consent screen in your default browser.
              </p>
            </div>

            {connectingState !== 'error' ? (
              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs text-blue-400 font-medium">
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" focusable="false" />
                  <span>
                    {connectingState === 'opening_browser'
                      ? 'Opening browser...'
                      : connectingState === 'awaiting_consent'
                      ? 'Awaiting consent in browser...'
                      : 'Verifying account access...'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-faint)] m-0">
                  Please sign in and approve the requested read permissions. Foundry will automatically detect completion via secure desktop loopback redirect.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 space-y-2 text-left">
                <div className="flex items-center gap-1.5 font-semibold">
                  <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" focusable="false" />
                  <span>Authorization Failed</span>
                </div>
                <p className="text-[11px] m-0 whitespace-pre-line text-red-300/90">{connectError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              {connectingState === 'error' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConnectingId(null);
                      setConnectingState(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                  >
                    Close
                  </button>
                  {activeConnectingId?.startsWith('google') && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = activeConnectingId;
                        setActiveConnectingId(null);
                        setConnectingState(null);
                        setGoogleModalTargetConnector(target);
                        setIsGoogleModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white cursor-pointer flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Configure Google in UI</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleStartOAuthConnect(activeConnectingId)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActiveConnectingId(null);
                    setConnectingState(null);
                  }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Connection Verification Modal */}
      <ConnectionVerificationModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        reports={verificationReports}
        isVerifying={isVerifyingAll}
        completedAt={verificationCompletedAt}
        onReverify={handleVerifyAll}
      />

      {/* Microsoft Connection Diagnostics Modal (Section 11) */}
      {isMicrosoftDiagOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ms-diag-title"
        >
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-400" aria-hidden="true" focusable="false" />
                <h3 id="ms-diag-title" className="text-base font-bold text-[var(--text-main)] m-0">
                  Microsoft Connection Diagnostics
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMicrosoftDiagOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" aria-hidden="true" focusable="false" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* OAuth Configuration */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-2">
                <span className="font-semibold text-blue-400 font-sans block text-sm">OAuth configuration</span>
                <div className="space-y-1 text-[var(--text-muted)]">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                    <span>Client ID configured ({OAUTH_CONFIG.MICROSOFT.clientId.slice(0, 8)}...)</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                    <span>Redirect URI configured ({OAUTH_CONFIG.MICROSOFT.redirectUri})</span>
                  </div>
                  {OAUTH_CONFIG.MICROSOFT.scopes && OAUTH_CONFIG.MICROSOFT.scopes.length > 0 ? (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                      <span>Scope configured ({OAUTH_CONFIG.MICROSOFT.scopes.join(' ')})</span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-sans space-y-1">
                      <span className="font-bold flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" aria-hidden="true" focusable="false" />
                        🔴 OAuth configuration error
                      </span>
                      <p className="m-0 text-xs">Missing required authorization scope.</p>
                      <p className="m-0 text-[11px] text-red-300">Expected: openid profile email offline_access User.Read Mail.Read</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                    <span>PKCE configured (S256 code challenge)</span>
                  </div>
                </div>
              </div>

              {/* Authentication */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-2">
                <span className="font-semibold text-blue-400 font-sans block text-sm">Authentication</span>
                <div className="space-y-1">
                  {configs['microsoft_outlook']?.connected ? (
                    <>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                        <span>Authorization code received</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                        <span>Token exchange successful (DPAPI secure storage)</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[var(--text-faint)]">
                      Not authenticated. Click "Connect Microsoft" to authorize.
                    </div>
                  )}
                </div>
              </div>

              {/* Microsoft Graph */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-2">
                <span className="font-semibold text-blue-400 font-sans block text-sm">Microsoft Graph</span>
                <div className="space-y-1">
                  {configs['microsoft_outlook']?.accountEmail ? (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                      <span>User identity verified ({configs['microsoft_outlook'].accountEmail})</span>
                    </div>
                  ) : (
                    <div className="text-[var(--text-faint)]">Awaiting token verification against /me</div>
                  )}
                </div>
              </div>

              {/* Outlook */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-2">
                <span className="font-semibold text-blue-400 font-sans block text-sm">Outlook</span>
                <div className="space-y-1">
                  {configs['microsoft_outlook']?.connected ? (
                    <>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                        <span>Mail.Read verified</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                        <span>Test message retrieval successful</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[var(--text-faint)]">Awaiting Mail.Read verification</div>
                  )}
                </div>
              </div>

              {/* Overall Status */}
              <div className="pt-2 flex items-center justify-between font-sans">
                <span className="text-xs text-[var(--text-muted)]">Status:</span>
                {configs['microsoft_outlook']?.connected ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    🟢 Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2.5 py-1 rounded-full">
                    Disconnected
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsMicrosoftDiagOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-main)] border border-[var(--border-subtle)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Modal */}
      <DataDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => {
          setIsDiagnosticsOpen(false);
          loadConfigs();
        }}
      />

      {/* Google Connection & In-App Credentials Modal */}
      <GoogleConnectionModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        targetConnectorId={googleModalTargetConnector}
        onSuccess={(msg) => {
          setStatusMessage(msg);
          setStatusType('success');
          loadConfigs();
        }}
        onStartOAuth={(connectorId) => {
          handleStartOAuthConnect(connectorId);
        }}
      />
    </div>
  );
};
