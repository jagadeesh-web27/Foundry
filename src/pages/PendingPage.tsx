import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  Hourglass,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  RefreshCw,
  Sparkles,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { commitmentEngine } from '@/services/commitments/commitmentEngine';
import { Commitment, CommitmentOverview } from '@/services/commitments/types';
import { dateResolver } from '@/services/commitments/dateResolver';
import { connectorStatusManager, ConnectorStatus } from '@/services/connectors/core/connectorStatus';
import { DataDiagnosticsModal } from '@/components/diagnostics/DataDiagnosticsModal';

interface PendingPageProps {
  onNavigateToChat?: (prompt: string) => void;
}

export const PendingPage: React.FC<PendingPageProps> = ({ onNavigateToChat }) => {
  const [overview, setOverview] = useState<CommitmentOverview>({
    needToDo: [],
    waitingFor: [],
    peopleWaitingForMe: [],
    upcoming: [],
    overdue: [],
    tentativeCount: 0,
  });

  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<'all' | 'needToDo' | 'waitingFor' | 'peopleWaitingForMe' | 'upcoming'>('all');
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [currentTime] = useState(() => Date.now());

  const loadData = useCallback(async () => {
    try {
      const [data, statuses] = await Promise.all([
        commitmentEngine.getOverview(),
        connectorStatusManager.getAllStatuses(),
      ]);
      setOverview(data);
      setConnectorStatuses(statuses);
      const totalPending = data.needToDo.length + data.waitingFor.length + data.peopleWaitingForMe.length;
      setStatusAnnouncement(`Loaded ${totalPending} pending items.`);
    } catch (e) {
      console.error('Failed to load commitments:', e);
      setStatusAnnouncement('Failed to load pending items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(() => {
      if (isMounted) void loadData();
    });
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  const handleComplete = async (id: string, title: string) => {
    await commitmentEngine.completeCommitment(id);
    setStatusAnnouncement(`Marked "${title}" as completed.`);
    loadData();
  };

  const handleDismiss = async (id: string, title: string) => {
    await commitmentEngine.dismissCommitment(id);
    setStatusAnnouncement(`Dismissed "${title}".`);
    loadData();
  };

  const handleConfirmTentative = async (id: string) => {
    await commitmentEngine.confirmTentativeCommitment(id);
    setStatusAnnouncement('Confirmed commitment for tracking.');
    loadData();
  };

  const filterItems = (items: Commitment[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.person?.name?.toLowerCase().includes(q) ||
        item.source.provider.toLowerCase().includes(q) ||
        item.evidence?.toLowerCase().includes(q)
    );
  };

  const renderSourcePill = (provider: string) => {
    const p = provider.toUpperCase();
    let bg = 'bg-blue-900/30 text-blue-400 border-blue-700/40';
    if (p.includes('OUTLOOK')) bg = 'bg-blue-900/30 text-blue-300 border-blue-600/40';
    else if (p.includes('TEAMS')) bg = 'bg-indigo-900/30 text-indigo-300 border-indigo-600/40';
    else if (p.includes('GMAIL')) bg = 'bg-red-900/30 text-red-300 border-red-600/40';
    else if (p.includes('SLACK')) bg = 'bg-purple-900/30 text-purple-300 border-purple-600/40';
    else if (p.includes('LOCAL')) bg = 'bg-emerald-900/30 text-emerald-300 border-emerald-600/40';

    return (
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${bg}`}>
        {provider}
      </span>
    );
  };

  const renderCommitmentCard = (item: Commitment) => {
    const isExpanded = expandedEvidenceId === item.id;
    const hasEvidence = !!item.evidence;
    const relativeDue = item.dueAt ? dateResolver.formatRelative(item.dueAt) : null;
    const isOverdue = item.dueAt && item.dueAt.getTime() < currentTime;

    return (
      <div
        key={item.id}
        className={`p-3.5 rounded-xl border transition-all ${
          isOverdue
            ? 'bg-red-950/20 border-red-800/40 hover:border-red-700/60'
            : item.isTentative
            ? 'bg-amber-950/15 border-amber-800/40 hover:border-amber-700/60'
            : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {renderSourcePill(item.source.provider)}

              {item.isTentative && (
                <span className="text-[10px] bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full">
                  Possible Commitment (Needs Confirmation)
                </span>
              )}

              {relativeDue && (
                <span
                  className={`text-xs font-medium flex items-center gap-1 ${
                    isOverdue ? 'text-red-400' : 'text-[var(--text-muted)]'
                  }`}
                >
                  <Clock className="w-3 h-3" aria-hidden="true" focusable="false" />
                  <span>{relativeDue}</span>
                </span>
              )}

              {item.person && (
                <span className="text-xs text-[var(--text-muted)]">
                  • with <strong className="text-[var(--text-main)]">{item.person.name}</strong>
                </span>
              )}
            </div>

            <h3 className="text-sm font-semibold text-[var(--text-main)] mb-1 leading-snug break-words m-0">
              {item.title}
            </h3>

            {/* Evidence quote */}
            {hasEvidence && (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setExpandedEvidenceId(isExpanded ? null : item.id)}
                  aria-expanded={isExpanded}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-blue-400 transition-colors cursor-pointer"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" aria-hidden="true" focusable="false" />
                  ) : (
                    <ChevronDown className="w-3 h-3" aria-hidden="true" focusable="false" />
                  )}
                  <span>{isExpanded ? 'Hide context' : 'Show context snippet'}</span>
                </button>

                {isExpanded && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-1">
                    <p className="italic text-[var(--text-main)] m-0">&ldquo;{item.evidence}&rdquo;</p>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-faint)] pt-1 border-t border-[var(--border-subtle)]">
                      <span>
                        {item.sources && item.sources.length > 1
                          ? `Sources: ${item.sources.map((s) => s.provider).join(', ')}`
                          : `Source: ${item.source.provider}`}
                      </span>
                      <span>Confidence: {Math.round(item.confidence * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {item.isTentative ? (
              <button
                type="button"
                onClick={() => handleConfirmTentative(item.id)}
                aria-label={`Confirm tracking for ${item.title}`}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                <span>Track</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleComplete(item.id, item.title)}
                aria-label={`Mark ${item.title} as done`}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                <span>Done</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleDismiss(item.id, item.title)}
              aria-label={`Dismiss ${item.title}`}
              className="p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              title="Dismiss"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const commConnectors = connectorStatuses.filter((s) =>
    ['microsoft_outlook', 'microsoft_teams', 'google_gmail', 'slack_workspace'].includes(s.connectorId)
  );
  const connectedCommCount = commConnectors.filter((s) => s.connected).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Screen Reader Status Announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {statusAnnouncement}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 m-0">
            <Hourglass className="w-6 h-6 text-blue-400" aria-hidden="true" focusable="false" />
            <span>Pending & Commitments</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1 m-0">
            Obligations, promises, deadlines, and waiting items derived from your conversations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            aria-label="Verify My Data"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Verify Data</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            aria-label="Refresh pending obligations"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} aria-hidden="true" focusable="false" />
            <span>Refresh</span>
          </button>

          {onNavigateToChat && (
            <button
              type="button"
              onClick={() => onNavigateToChat('What am I forgetting this week?')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
              <span>Ask &ldquo;What am I forgetting?&rdquo;</span>
            </button>
          )}
        </div>
      </div>

      {/* Disconnected Notice */}
      {connectedCommCount === 0 && (
        <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-800/30 text-xs text-blue-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" focusable="false" />
          <div className="space-y-0.5">
            <span className="font-semibold block text-blue-200">Local Obligations Mode</span>
            <p className="m-0 text-[11px] text-blue-200/80">
              No external communication connectors (Outlook, Teams, Gmail) are currently connected. Displaying manually created commitments and local task obligations.
            </p>
          </div>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" focusable="false" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search obligations, persons, or evidence..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedSection('all')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              selectedSection === 'all'
                ? 'bg-[var(--bg-card)] text-[var(--text-main)] font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            All ({overview.needToDo.length + overview.waitingFor.length + overview.peopleWaitingForMe.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedSection('needToDo')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              selectedSection === 'needToDo'
                ? 'bg-[var(--bg-card)] text-red-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            Need To Do ({overview.needToDo.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedSection('waitingFor')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              selectedSection === 'waitingFor'
                ? 'bg-[var(--bg-card)] text-amber-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            Waiting For ({overview.waitingFor.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedSection('peopleWaitingForMe')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              selectedSection === 'peopleWaitingForMe'
                ? 'bg-[var(--bg-card)] text-purple-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            People Waiting ({overview.peopleWaitingForMe.length})
          </button>
        </div>
      </div>

      {/* Categorized Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Section 1: I Need To Do */}
        {(selectedSection === 'all' || selectedSection === 'needToDo') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-red-400" aria-hidden="true" focusable="false" />
                <h2 className="text-sm font-semibold text-[var(--text-main)] m-0">I Need To Do</h2>
              </div>
              <span className="text-xs text-[var(--text-muted)] font-mono">{overview.needToDo.length}</span>
            </div>

            <div className="space-y-2.5">
              {filterItems(overview.needToDo).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-4 text-center">No active tasks or promises.</p>
              ) : (
                filterItems(overview.needToDo).map((item) => renderCommitmentCard(item))
              )}
            </div>
          </div>
        )}

        {/* Section 2: I Am Waiting For */}
        {(selectedSection === 'all' || selectedSection === 'waitingFor') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-amber-400" aria-hidden="true" focusable="false" />
                <h2 className="text-sm font-semibold text-[var(--text-main)] m-0">I Am Waiting For</h2>
              </div>
              <span className="text-xs text-[var(--text-muted)] font-mono">{overview.waitingFor.length}</span>
            </div>

            <div className="space-y-2.5">
              {filterItems(overview.waitingFor).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-4 text-center">Not waiting on any external items.</p>
              ) : (
                filterItems(overview.waitingFor).map((item) => renderCommitmentCard(item))
              )}
            </div>
          </div>
        )}

        {/* Section 3: People Waiting For Me */}
        {(selectedSection === 'all' || selectedSection === 'peopleWaitingForMe') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-purple-400" aria-hidden="true" focusable="false" />
                <h2 className="text-sm font-semibold text-[var(--text-main)] m-0">People Waiting For Me</h2>
              </div>
              <span className="text-xs text-[var(--text-muted)] font-mono">{overview.peopleWaitingForMe.length}</span>
            </div>

            <div className="space-y-2.5">
              {filterItems(overview.peopleWaitingForMe).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-4 text-center">Nobody is waiting on your response.</p>
              ) : (
                filterItems(overview.peopleWaitingForMe).map((item) => renderCommitmentCard(item))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Verify Data Diagnostics Modal */}
      <DataDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </div>
  );
};
