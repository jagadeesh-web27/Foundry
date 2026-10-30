import React, { useState, useEffect } from 'react';
import {
  Zap,
  Clock,
  Sun,
  Moon,
  Compass,
  Plus,
  Trash2,
  HardDrive,
} from 'lucide-react';
import { productivityEngine, DailyBriefingData, EndOfDaySummaryData } from '@/services/productivity/productivityEngine';
import { AutomationRule, ProductivityTask } from '@/services/db/database';

export const AutomationsPage: React.FC = () => {
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [activeBriefing, setActiveBriefing] = useState<DailyBriefingData | null>(null);
  const [activeSummary, setActiveSummary] = useState<EndOfDaySummaryData | null>(null);
  const [recentActivity, setRecentActivity] = useState<{
    period: string;
    filesWorkedOn: { name: string; path: string; modifiedAt?: string }[];
    recentTasks: ProductivityTask[];
  } | null>(null);

  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // New automation form
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'reminder' | 'recurring'>('reminder');
  const [cronOrDate, setCronOrDate] = useState('');

  const loadAutomations = async () => {
    try {
      const list = await productivityEngine.listAutomations();
      setAutomations(list);
    } catch (err) {
      console.error('Failed to load automations:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    productivityEngine.listAutomations().then((list) => {
      if (!cancelled) setAutomations(list);
    }).catch((err) => {
      console.error('Failed to load automations:', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const b = await productivityEngine.getDailyBriefing();
      setActiveBriefing(b);
    } finally {
      setLoadingBriefing(false);
    }
  };

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    try {
      const s = await productivityEngine.getEndOfDaySummary();
      setActiveSummary(s);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleFetchRecentActivity = async () => {
    setLoadingActivity(true);
    try {
      const acts = await productivityEngine.getRecentActivity(2);
      setRecentActivity(acts);
    } finally {
      setLoadingActivity(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (type === 'reminder') {
      await productivityEngine.createReminder({
        title: title.trim(),
        scheduleTime: cronOrDate || new Date(Date.now() + 3600000).toISOString(),
      });
    } else {
      await productivityEngine.createRecurringAutomation({
        title: title.trim(),
        dayOfWeek: 5, // Friday
        scheduleTime: cronOrDate || '09:00',
        actionType: 'reminder',
      });
    }

    setTitle('');
    setCronOrDate('');
    setIsCreating(false);
    await loadAutomations();
  };

  const handleDelete = async (id: string) => {
    await productivityEngine.deleteAutomation(id);
    await loadAutomations();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-400" />
            Automations &amp; Personal Assistant
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Automate recurring routines, daily morning briefings, and device intelligence summaries.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Automation</span>
        </button>
      </div>

      {/* Intelligence Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Morning Briefing Card */}
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-amber-400" />
              Daily Briefing
            </span>
            <button
              onClick={handleGenerateBriefing}
              disabled={loadingBriefing}
              className="px-2.5 py-1 text-[10px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium cursor-pointer"
            >
              {loadingBriefing ? 'Generating...' : 'Generate Now'}
            </button>
          </div>
          {activeBriefing ? (
            <div className="text-[11px] text-[var(--text-muted)] space-y-1.5 bg-[var(--bg-primary)] p-3 rounded-lg border border-[var(--border-subtle)]">
              <p className="font-medium text-[var(--text-main)]">{activeBriefing.date}</p>
              <p>Tasks due today: <span className="text-amber-400">{activeBriefing.tasksDueToday.length}</span></p>
              <p>High priority: <span className="text-rose-400">{activeBriefing.highPriorityTasks.length}</span></p>
              <p className="text-[10px] text-[var(--text-faint)] truncate">{activeBriefing.systemSummary}</p>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">
              Gathers tasks, system health, and yesterday&apos;s project activity into a morning digest.
            </p>
          )}
        </div>

        {/* End of Day Summary Card */}
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-indigo-400" />
              End-of-Day Summary
            </span>
            <button
              onClick={handleGenerateSummary}
              disabled={loadingSummary}
              className="px-2.5 py-1 text-[10px] rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 font-medium cursor-pointer"
            >
              {loadingSummary ? 'Summarizing...' : 'Summarize'}
            </button>
          </div>
          {activeSummary ? (
            <div className="text-[11px] text-[var(--text-muted)] space-y-1.5 bg-[var(--bg-primary)] p-3 rounded-lg border border-[var(--border-subtle)]">
              <p className="font-medium text-[var(--text-main)]">{activeSummary.date}</p>
              <p>Files modified: <span className="text-emerald-400">{activeSummary.filesModifiedToday.length}</span></p>
              <p>Completed tasks: <span className="text-blue-400">{activeSummary.completedTasks.length}</span></p>
              <p>Pending tasks: <span className="text-amber-400">{activeSummary.pendingTasks.length}</span></p>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">
              Audits files changed today, tasks closed, and active projects before you clock out.
            </p>
          )}
        </div>

        {/* Activity Intelligence Card */}
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-400" />
              What was I working on?
            </span>
            <button
              onClick={handleFetchRecentActivity}
              disabled={loadingActivity}
              className="px-2.5 py-1 text-[10px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-medium cursor-pointer"
            >
              {loadingActivity ? 'Inspecting...' : 'Inspect'}
            </button>
          </div>
          {recentActivity ? (
            <div className="text-[11px] text-[var(--text-muted)] space-y-1 max-h-28 overflow-y-auto bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--border-subtle)]">
              <div className="font-medium text-[var(--text-main)]">{recentActivity.period}</div>
              <div>Files ({recentActivity.filesWorkedOn.length}):</div>
              {recentActivity.filesWorkedOn.slice(0, 4).map((f, i) => (
                <div key={i} className="truncate text-[10px] text-[var(--text-faint)]">• {f.name}</div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">
              Instantly inspects recently edited files and running work processes on your device.
            </p>
          )}
        </div>
      </div>

      {/* Create Automation Form */}
      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 rounded-xl bg-[var(--bg-card)] border border-amber-500/40 space-y-3 shadow-lg">
          <div className="text-xs font-semibold text-[var(--text-main)]">Schedule New Automation or Reminder</div>
          <input
            type="text"
            placeholder="Instruction or reminder (e.g. Remind me to send weekly report)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-amber-500"
            autoFocus
          />

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Type:</span>
              <button
                type="button"
                onClick={() => setType('reminder')}
                className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                  type === 'reminder' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-[var(--text-faint)]'
                }`}
              >
                One-time Reminder
              </button>
              <button
                type="button"
                onClick={() => setType('recurring')}
                className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                  type === 'recurring' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-[var(--text-faint)]'
                }`}
              >
                Recurring Routine
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">{type === 'reminder' ? 'Scheduled Time:' : 'Schedule Time (HH:MM):'}</span>
              <input
                type={type === 'reminder' ? 'datetime-local' : 'text'}
                placeholder={type === 'recurring' ? '09:00' : undefined}
                value={cronOrDate}
                onChange={(e) => setCronOrDate(e.target.value)}
                className="px-2 py-1 text-xs rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                Save Automation
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Pre-Built Routine Templates */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] m-0">
          Personal Routine Templates (One-Click Enable)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              title: 'Morning Briefing',
              desc: 'Daily device status, tasks due today, and recent project files.',
              time: '09:00',
              type: 'briefing' as const,
              icon: Sun,
            },
            {
              title: 'Weekly Review',
              desc: 'Review completed tasks and git updates every Friday.',
              time: '17:00',
              dayOfWeek: 5,
              type: 'summary' as const,
              icon: Compass,
            },
            {
              title: 'Download Organizer',
              desc: 'Classify and organize cluttered downloads weekly on Sunday.',
              time: '10:00',
              dayOfWeek: 0,
              type: 'custom' as const,
              icon: HardDrive,
            },
            {
              title: 'Follow-Up Check',
              desc: 'Daily check for pending promises and waiting items.',
              time: '10:00',
              type: 'reminder' as const,
              icon: Clock,
            },
            {
              title: 'End-of-Day Wrap-Up',
              desc: 'Daily summary of accomplished work and tomorrow priorities.',
              time: '18:00',
              type: 'summary' as const,
              icon: Moon,
            },
          ].map((tmpl, idx) => {
            const Icon = tmpl.icon;
            const isAlreadyActive = automations.some((a) => a.title === tmpl.title);
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-amber-400">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-bold text-[var(--text-main)]">{tmpl.title}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] m-0">{tmpl.desc}</p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-[var(--text-faint)]">
                    {tmpl.dayOfWeek !== undefined ? 'Weekly' : 'Daily'} at {tmpl.time}
                  </span>
                  <button
                    type="button"
                    disabled={isAlreadyActive}
                    onClick={async () => {
                      await productivityEngine.createRecurringAutomation({
                        title: tmpl.title,
                        dayOfWeek: tmpl.dayOfWeek ?? 1,
                        scheduleTime: tmpl.time,
                        actionType: tmpl.type,
                        description: tmpl.desc,
                      });
                      await loadAutomations();
                    }}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-medium cursor-pointer transition-colors ${
                      isAlreadyActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                        : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {isAlreadyActive ? 'Active' : '+ Enable'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Automations List */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
          Active Scheduled Automations ({automations.length})
        </h2>

        {automations.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-[var(--border-subtle)] rounded-xl">
            <Clock className="w-8 h-8 text-[var(--text-faint)] mx-auto mb-2 opacity-50" />
            <p className="text-xs text-[var(--text-muted)]">No active scheduled automations.</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-1">
              Ask Foundry: &quot;Remind me every Friday at 4 PM to back up my code&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {automations.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-amber-500/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="text-xs font-medium text-[var(--text-main)]">{a.title}</div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-faint)]">
                    <span className="capitalize px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                      {a.scheduleType}
                    </span>
                    {a.scheduleTime && <span>Time: {a.scheduleTime}</span>}
                    {a.actionType && <span>Action: {a.actionType}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="p-1.5 rounded hover:bg-rose-500/10 text-[var(--text-faint)] hover:text-rose-400 transition-colors cursor-pointer"
                  title="Delete automation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
