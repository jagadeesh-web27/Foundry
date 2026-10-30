import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sun,
  Moon,
  Sunrise,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  HardDrive,
  Cpu,
  Target,
  FileText,
  UserCheck,
  RefreshCw,
  Zap,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { productivityEngine } from '@/services/productivity/productivityEngine';
import { followUpEngine, AttentionItem } from '@/services/followup/followUpEngine';
import { commitmentEngine } from '@/services/commitments/commitmentEngine';
import { Commitment } from '@/services/commitments/types';
import { computerService } from '@/services/native/computerService';
import { db, ProductivityTask, FollowUpItem, GoalItem } from '@/services/db/database';
import { useApp } from '@/stores/AppContext';
import { connectorStatusManager, ConnectorStatus } from '@/services/connectors/core/connectorStatus';
import { DataDiagnosticsModal } from '@/components/diagnostics/DataDiagnosticsModal';

interface TodayPageProps {
  onExecuteQuickAction?: (query: string) => void;
}

export const TodayPage: React.FC<TodayPageProps> = ({ onExecuteQuickAction }) => {
  const { revealFile } = useApp();
  const currentDate = useMemo(() => new Date(), []);
  const greeting = useMemo(() => {
    const hour = currentDate.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, [currentDate]);
  const formattedDate = useMemo(() => {
    return currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [currentDate]);

  const [tasks, setTasks] = useState<ProductivityTask[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [waitingCommitments, setWaitingCommitments] = useState<Commitment[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<{ name: string; path: string; modifiedAt?: string }[]>([]);
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatus[]>([]);
  const [sysInfo, setSysInfo] = useState<{
    cpu: string;
    ramUsed: string;
    ramTotal: string;
    ramPercent: number;
    diskFree: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);

  // New task input state
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const loadData = useCallback(async () => {
    try {
      const now = currentDate;

      // ── Phase 1: Fast DB queries — render the UI immediately ──
      const [loadedTasks, loadedFollowUps, loadedAttention, loadedGoals, commitmentOverview, statuses] = await Promise.all([
        db.getTasks('todo'),
        db.getFollowUps('pending'),
        followUpEngine.getAttentionItems(),
        db.getGoals('active'),
        commitmentEngine.getOverview(),
        connectorStatusManager.getAllStatuses(),
      ]);

      setTasks(loadedTasks.slice(0, 6));
      setFollowUps(loadedFollowUps.slice(0, 5));
      setAttentionItems(loadedAttention);
      setGoals(loadedGoals.slice(0, 4));
      setCommitments(commitmentOverview.needToDo.slice(0, 5));
      setWaitingCommitments(commitmentOverview.waitingFor.slice(0, 4));
      setConnectorStatuses(statuses);

      // Mark as loaded so the UI renders — don't wait for heavy queries below
      setLoading(false);

      // ── Phase 2: Deferred heavy loads — filesystem & hardware ──
      // Use requestIdleCallback on mobile to avoid blocking touch interactions
      const deferHeavyLoads = () => {
        // Recent files modified today from actual local filesystem
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
        computerService.searchFilesLive({
          modifiedAfter: startOfToday,
          limit: 6,
          sortBy: 'modified',
          sortOrder: 'desc',
        }).then((liveFiles) => {
          setRecentFiles(liveFiles.map((f) => ({ name: f.name, path: f.path, modifiedAt: f.modifiedAt })));
        }).catch(async () => {
          try {
            const allFiles = await db.getAllIndexedFiles();
            setRecentFiles(allFiles.slice(0, 6).map((f) => ({ name: f.name, path: f.path, modifiedAt: f.modifiedAt })));
          } catch {}
        });

        // System stats from real hardware
        Promise.all([
          computerService.getSystemInfo(),
          computerService.getDiskInformation(),
        ]).then(([sys, disks]) => {
          const primaryDisk = disks.find((d) => d.drive.includes('C:')) || disks[0];
          setSysInfo({
            cpu: sys.cpuBrand,
            ramUsed: sys.usedRamFormatted,
            ramTotal: sys.totalRamFormatted,
            ramPercent: sys.ramPercentageUsed,
            diskFree: primaryDisk ? primaryDisk.freeFormatted : 'Available',
          });
        }).catch(() => {});
      };

      // requestIdleCallback defers until the browser is idle — prevents jank on mobile
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(deferHeavyLoads, { timeout: 2000 });
      } else {
        setTimeout(deferHeavyLoads, 100);
      }

      return; // skip the finally setLoading since we already set it above
    } catch (err) {
      console.error('Error loading Today dashboard:', err);
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(() => {
      if (isMounted) void loadData();
    });
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  const handleToggleTask = async (task: ProductivityTask) => {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await productivityEngine.updateTaskStatus(task.id, nextStatus);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const created = await productivityEngine.createTask({
      title: newTaskTitle.trim(),
      priority: 'medium',
    });
    setTasks((prev) => [created, ...prev]);
    setNewTaskTitle('');
  };

  const handleResolveFollowUp = async (id: string) => {
    await followUpEngine.resolveFollowUp(id);
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    setAttentionItems((prev) => prev.filter((a) => a.id !== id));
  };

  const handleQuickAction = (actionPrompt: string) => {
    if (onExecuteQuickAction) {
      onExecuteQuickAction(actionPrompt);
    }
  };

  // Communication connectors provenance
  const commConnectors = connectorStatuses.filter((s) =>
    ['microsoft_outlook', 'microsoft_teams', 'google_gmail', 'slack_workspace', 'google_chat', 'whatsapp_business', 'telegram_bot'].includes(s.connectorId)
  );
  const connectedCommCount = commConnectors.filter((s) => s.connected && s.dataState !== 'failed').length;
  const failedCommConnectors = commConnectors.filter((s) => s.connected && s.dataState === 'failed');

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-6xl mx-auto w-full space-y-6 text-[var(--text-main)] select-text">
      {/* Executive Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center space-x-2 text-blue-400 text-sm font-medium mb-1">
            {new Date().getHours() < 12 ? (
              <Sunrise className="w-4 h-4 text-amber-400" aria-hidden="true" focusable="false" />
            ) : new Date().getHours() < 18 ? (
              <Sun className="w-4 h-4 text-amber-500" aria-hidden="true" focusable="false" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-400" aria-hidden="true" focusable="false" />
            )}
            <span>{greeting}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight m-0 text-[var(--text-main)]">Today’s Overview</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 m-0">{formattedDate}</p>
        </div>

        <div className="flex items-center space-x-3">
          {sysInfo && (
            <div className="hidden lg:flex items-center space-x-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs">
              <div className="flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" focusable="false" />
                <span className="text-[var(--text-muted)]">RAM:</span>
                <span className="font-semibold">{sysInfo.ramPercent}%</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" focusable="false" />
                <span className="text-[var(--text-muted)]">Disk:</span>
                <span className="font-semibold">{sysInfo.diskFree} free</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            aria-label="Verify My Data and view provenance diagnostics"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Verify Data</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            aria-label="Refresh Today's data"
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
            title="Refresh Today"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} aria-hidden="true" focusable="false" />
          </button>
        </div>
      </div>

      {/* Needs Attention Alert Banner */}
      {(attentionItems.length > 0 || commitments.length > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" focusable="false" />
          <div className="flex-1 text-xs">
            <h4 className="font-semibold text-amber-300 m-0 mb-1">
              Needs Attention ({attentionItems.length + commitments.length} item{attentionItems.length + commitments.length > 1 ? 's' : ''})
            </h4>
            <div className="space-y-1.5 text-amber-200/90">
              {commitments.map((com) => (
                <div key={com.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-red-400">🔴</span>
                    <strong>{com.title}</strong>
                    <span className="text-amber-400/80">
                      {com.person?.name ? `(${com.person.name})` : ''}
                    </span>
                    <span className="text-[10px] bg-amber-950/60 border border-amber-800/40 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                      {com.sources && com.sources.length > 1
                        ? `Sources: ${com.sources.map((s) => s.provider).join(', ')}`
                        : `Source: ${com.source.provider}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await commitmentEngine.completeCommitment(com.id);
                      setCommitments((prev) => prev.filter((c) => c.id !== com.id));
                    }}
                    className="text-[10px] underline hover:text-amber-100 cursor-pointer ml-2"
                  >
                    Done
                  </button>
                </div>
              ))}

              {attentionItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span>
                    🟠 <strong>{item.title}</strong>{' '}
                    <span className="text-amber-400/80">
                      ({item.reason === 'due_today' ? 'Due Today' : item.reason === 'overdue' ? 'Overdue' : 'Waiting > 2 days'})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleResolveFollowUp(item.id)}
                    className="text-[10px] underline hover:text-amber-100 cursor-pointer ml-2"
                  >
                    Mark Resolved
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Shortcuts */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Quick Assistants
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => handleQuickAction('What should I focus on today?')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-blue-500/30 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </div>
            <span className="text-xs font-medium text-[var(--text-main)] leading-tight">Focus Plan</span>
            <span className="text-[10px] text-[var(--text-muted)]">What should I do?</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickAction('Give me my morning daily briefing')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-amber-500/30 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <Sunrise className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </div>
            <span className="text-xs font-medium text-[var(--text-main)] leading-tight">Daily Briefing</span>
            <span className="text-[10px] text-[var(--text-muted)]">Morning roundup</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickAction('Give me my end of day summary')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-purple-500/30 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <Moon className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </div>
            <span className="text-xs font-medium text-[var(--text-main)] leading-tight">End of Day</span>
            <span className="text-[10px] text-[var(--text-muted)]">Wrap up summary</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickAction('What did I do today?')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-emerald-500/30 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </div>
            <span className="text-xs font-medium text-[var(--text-main)] leading-tight">Activity Log</span>
            <span className="text-[10px] text-[var(--text-muted)]">Files & apps</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickAction("What's in my downloads folder?")}
            className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-cyan-500/30 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <HardDrive className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </div>
            <span className="text-xs font-medium text-[var(--text-main)] leading-tight">Downloads</span>
            <span className="text-[10px] text-[var(--text-muted)]">Organize clutter</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickAction('Why is my computer slow?')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-rose-500/30 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
              <Zap className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            </div>
            <span className="text-xs font-medium text-[var(--text-main)] leading-tight">Troubleshoot</span>
            <span className="text-[10px] text-[var(--text-muted)]">RAM & CPU check</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tasks & Follow-ups */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tasks Card */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400" aria-hidden="true" focusable="false" />
                <h3 className="text-sm font-semibold m-0">Tasks for Today (Local Store)</h3>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{tasks.length} active</span>
            </div>

            {/* Quick Add Task Input */}
            <form onSubmit={handleCreateTask} className="mb-3 flex gap-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add a task for today..."
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] outline-none focus:border-blue-500/50"
              />
              <button
                type="submit"
                disabled={!newTaskTitle.trim()}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors cursor-pointer"
              >
                Add
              </button>
            </form>

            <div className="space-y-1.5">
              {tasks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                  No active tasks for today. Add one above to get started!
                </p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleToggleTask(task)}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)] text-xs"
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <div className="w-4 h-4 rounded-full border border-blue-400/40 flex items-center justify-center flex-shrink-0 hover:bg-blue-500/20">
                        {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" focusable="false" />}
                      </div>
                      <span className="truncate font-medium">{task.title}</span>
                    </div>

                    {task.priority === 'high' && (
                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-sm font-semibold">
                        HIGH
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Follow-Ups & Waiting For Card with Truthful Provenance */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-purple-400" aria-hidden="true" focusable="false" />
                <h3 className="text-sm font-semibold m-0">Follow-Ups & Waiting On</h3>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{followUps.length + waitingCommitments.length} pending</span>
            </div>

            {/* Truthful Data Provenance Header */}
            <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]/60 border border-[var(--border-subtle)] text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-main)]">Communication Analysis:</span>
                <span>{connectedCommCount > 0 ? `${connectedCommCount} connected & active` : 'None connected'}</span>
              </div>
              <div className="space-y-1.5 pt-1">
                {commConnectors.map((c) => {
                  const isWhatsApp = c.connectorId === 'whatsapp_business';
                  const isChat = c.connectorId === 'google_chat';
                  const hasLimitation = (isWhatsApp || isChat) && !c.connected;

                  return (
                    <div
                      key={c.connectorId}
                      className="flex items-center justify-between text-[11px] p-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                    >
                      <div className="flex items-center gap-1.5">
                        {c.connected && c.dataState !== 'failed' ? (
                          <span className="text-emerald-400 font-bold">✓</span>
                        ) : c.connected && c.dataState === 'failed' ? (
                          <span className="text-rose-400 font-bold">✗</span>
                        ) : hasLimitation ? (
                          <span className="text-amber-400 font-bold">⚠</span>
                        ) : (
                          <span className="text-[var(--text-faint)]">⚪</span>
                        )}
                        <span className="font-medium text-[var(--text-main)]">
                          {c.displayName.replace('Microsoft ', '').replace('Google ', '')}
                        </span>
                        {c.connected && c.recordsAnalyzed > 0 && (
                          <span className="text-[var(--text-muted)] text-[10px]">
                            ({c.recordsAnalyzed} records analyzed)
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-[var(--text-muted)]">
                        {c.connected && c.dataState !== 'failed' ? (
                          <span className="text-emerald-300 font-medium">
                            {c.lastSyncAt ? `Last checked: ${new Date(c.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connected'}
                          </span>
                        ) : c.connected && c.dataState === 'failed' ? (
                          <span className="text-rose-400 font-medium">Sync Failed</span>
                        ) : isWhatsApp ? (
                          <span className="text-amber-400/90 font-medium">Personal chat analysis unavailable</span>
                        ) : isChat ? (
                          <span className="text-amber-400/90 font-medium">Workspace permissions required</span>
                        ) : (
                          <span className="text-[var(--text-faint)]">Not connected</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error notice if connected service failed */}
            {failedCommConnectors.length > 0 && (
              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-800/40 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" aria-hidden="true" focusable="false" />
                <div>
                  <span className="font-semibold block">Sync Incomplete:</span>
                  <span className="text-[11px] text-rose-200/80">
                    {failedCommConnectors.map((f) => `${f.displayName} (${f.error || 'Failed'})`).join(', ')}. Data may be outdated.
                  </span>
                </div>
              </div>
            )}

            {/* Case A: No communication sources connected (Conforms to Section 23) */}
            {connectedCommCount === 0 && (
              <div className="p-4 rounded-xl bg-blue-950/25 border border-blue-800/40 text-xs text-blue-200 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-blue-100 text-sm">
                  <Info className="w-4 h-4 text-blue-400" aria-hidden="true" focusable="false" />
                  <span>No communication sources connected.</span>
                </div>
                <p className="text-xs text-blue-200/80 m-0 leading-relaxed">
                  Foundry has not analyzed your email or messaging accounts. Connect an account to enable intelligent follow-up and deadline tracking across your communication.
                </p>
              </div>
            )}

            {/* Follow-up items list */}
            <div className="space-y-2 pt-1">
              {followUps.length === 0 && waitingCommitments.length === 0 ? (
                connectedCommCount > 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                    All connected accounts checked. No active follow-ups or pending external obligations found.
                  </p>
                ) : null
              ) : (
                <>
                  {waitingCommitments.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]/50 border border-purple-500/20 text-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="overflow-hidden">
                          <p className="font-medium m-0">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.person && (
                              <p className="text-[11px] text-purple-300/80 m-0">Waiting on: {item.person.name}</p>
                            )}
                            <span className="text-[10px] text-[var(--text-faint)] bg-[var(--bg-secondary)] px-1.5 py-0.2 rounded font-mono">
                              {item.sources && item.sources.length > 1
                                ? `Sources: ${item.sources.map((s) => s.provider).join(', ')}`
                                : item.source.provider}
                            </span>
                            {item.confidence && (
                              <span className="text-[10px] text-emerald-400 font-medium">
                                {Math.round(item.confidence * 100)}% confidence
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.evidence && (
                            <button
                              type="button"
                              onClick={() => setExpandedEvidenceId(expandedEvidenceId === item.id ? null : item.id)}
                              aria-label="Toggle evidence view"
                              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded cursor-pointer"
                            >
                              {expandedEvidenceId === item.id ? (
                                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await commitmentEngine.completeCommitment(item.id);
                              loadData();
                            }}
                            className="px-2 py-1 text-[11px] text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-md cursor-pointer transition-colors whitespace-nowrap"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>

                      {expandedEvidenceId === item.id && item.evidence && (
                        <div className="p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] italic">
                          &ldquo;{item.evidence}&rdquo;
                        </div>
                      )}
                    </div>
                  ))}

                  {followUps.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)] text-xs"
                    >
                      <div className="overflow-hidden mr-2">
                        <p className="font-medium truncate m-0">{item.title}</p>
                        {item.targetPerson && (
                          <p className="text-[11px] text-purple-300/80 m-0">Person: {item.targetPerson}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResolveFollowUp(item.id)}
                        className="px-2 py-1 text-[11px] text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-md cursor-pointer transition-colors whitespace-nowrap"
                      >
                        Resolve
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Goals & Recent Files */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Goals */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-emerald-400" aria-hidden="true" focusable="false" />
                <h3 className="text-sm font-semibold m-0">Active Goals & Progress</h3>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{goals.length} ongoing</span>
            </div>

            <div className="space-y-3">
              {goals.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                  No active goals set. Type &quot;Create goal&quot; in chat to start one!
                </p>
              ) : (
                goals.map((g) => (
                  <div key={g.id} className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold truncate">{g.title}</span>
                      <span className="text-emerald-400 font-bold">{g.progress}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${g.progress}%` }}
                      />
                    </div>

                    {g.nextAction && (
                      <p className="text-[11px] text-[var(--text-muted)] truncate m-0">
                        Next: <span className="text-[var(--text-main)]">{g.nextAction}</span>
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Files Modified Today (Truthful Filesystem Label) */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" aria-hidden="true" focusable="false" />
                <h3 className="text-sm font-semibold m-0">Files Modified Today (Local PC)</h3>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{recentFiles.length} files</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-3 m-0">
              Scanned from real Windows filesystem modified timestamps
            </p>

            <div className="space-y-2">
              {recentFiles.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                  No file modifications recorded on this device today.
                </p>
              ) : (
                recentFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]/40 hover:bg-[var(--bg-tertiary)] text-xs transition-colors"
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium truncate m-0">{file.name}</p>
                        {file.modifiedAt && (
                          <span className="text-[10px] text-[var(--text-faint)]">
                            {new Date(file.modifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] truncate m-0 font-mono">{file.path}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revealFile(file.path)}
                      aria-label={`Reveal ${file.name} in Windows Explorer`}
                      className="text-blue-400 hover:text-blue-300 p-1 cursor-pointer shrink-0"
                      title="Reveal in Explorer"
                    >
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Verify Data Diagnostics Modal */}
      <DataDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </div>
  );
};
