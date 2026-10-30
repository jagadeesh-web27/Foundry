/**
 * Foundry Productivity Engine
 * Powers tasks, scheduled reminders, recurring automations, daily briefings, and honest activity intelligence.
 */

import { db, ProductivityTask, AutomationRule } from '@/services/db/database';
import { computerService } from '@/services/native/computerService';

export interface DailyBriefingData {
  date: string;
  tasksDueToday: ProductivityTask[];
  highPriorityTasks: ProductivityTask[];
  recentFilesModified: { name: string; path: string; modifiedAt?: string }[];
  activeApps: string[];
  systemSummary: string;
}

export interface EndOfDaySummaryData {
  date: string;
  completedTasks: ProductivityTask[];
  pendingTasks: ProductivityTask[];
  filesModifiedToday: { name: string; path: string }[];
}

export class ProductivityEngine {
  // ────── TASK MANAGEMENT ──────

  async createTask(args: {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
    tags?: string[];
  }): Promise<ProductivityTask> {
    const task: ProductivityTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: args.title.trim(),
      description: args.description?.trim(),
      status: 'todo',
      priority: args.priority || 'medium',
      dueDate: args.dueDate,
      tags: args.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.upsertTask(task);
    return task;
  }

  async listTasks(status?: 'todo' | 'in_progress' | 'done'): Promise<ProductivityTask[]> {
    return db.getTasks(status);
  }

  async updateTaskStatus(id: string, status: 'todo' | 'in_progress' | 'done'): Promise<boolean> {
    const all = await db.getTasks();
    const task = all.find((t) => t.id === id);
    if (!task) return false;

    task.status = status;
    task.updatedAt = new Date().toISOString();
    await db.upsertTask(task);
    return true;
  }

  async deleteTask(id: string): Promise<boolean> {
    await db.deleteTask(id);
    return true;
  }

  // ────── REMINDERS & AUTOMATIONS ──────

  async createReminder(args: {
    title: string;
    scheduleTime: string; // e.g. "2026-09-23T09:00:00" or "09:00"
    description?: string;
  }): Promise<AutomationRule> {
    const rule: AutomationRule = {
      id: `auto_${Date.now()}`,
      title: args.title.trim(),
      description: args.description?.trim(),
      scheduleType: 'once',
      scheduleTime: args.scheduleTime,
      actionType: 'reminder',
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    await db.upsertAutomation(rule);
    return rule;
  }

  async createRecurringAutomation(args: {
    title: string;
    dayOfWeek: number; // 0=Sunday, 5=Friday
    scheduleTime: string; // e.g. "09:00"
    description?: string;
    actionType?: 'reminder' | 'briefing' | 'summary' | 'custom';
  }): Promise<AutomationRule> {
    const rule: AutomationRule = {
      id: `auto_${Date.now()}`,
      title: args.title.trim(),
      description: args.description?.trim(),
      scheduleType: 'recurring',
      scheduleTime: args.scheduleTime,
      dayOfWeek: args.dayOfWeek,
      actionType: args.actionType || 'reminder',
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    await db.upsertAutomation(rule);
    return rule;
  }

  async listAutomations(): Promise<AutomationRule[]> {
    return db.getAutomations();
  }

  async deleteAutomation(id: string): Promise<boolean> {
    await db.deleteAutomation(id);
    return true;
  }

  // ────── ACTIVITY & DAILY INTELLIGENCE ──────

  /**
   * Generates a morning briefing with real tasks, recent files, and system status
   */
  async getDailyBriefing(): Promise<DailyBriefingData> {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();

    const allTasks = await db.getTasks('todo');
    const tasksDueToday = allTasks.filter((t) => t.dueDate && t.dueDate.startsWith(todayIso));
    const highPriorityTasks = allTasks.filter((t) => t.priority === 'high');

    // Live recent files modified today
    let recentFiles: { name: string; path: string; modifiedAt?: string }[] = [];
    try {
      const files = await computerService.searchFilesLive({
        modifiedAfter: startOfToday,
        limit: 10,
        sortBy: 'modified',
        sortOrder: 'desc',
      });
      recentFiles = files.map((f) => ({ name: f.name, path: f.path, modifiedAt: f.modifiedAt }));
    } catch {}

    // Live running applications
    let activeApps: string[] = [];
    try {
      const apps = await computerService.getRunningApplications();
      activeApps = apps.slice(0, 5).map((a) => a.name);
    } catch {}

    // System summary
    let systemSummary = 'System operational';
    try {
      const sys = await computerService.getSystemInfo();
      systemSummary = `${sys.cpuBrand} | ${sys.usedRamFormatted} / ${sys.totalRamFormatted} RAM used`;
    } catch {}

    return {
      date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      tasksDueToday,
      highPriorityTasks,
      recentFilesModified: recentFiles,
      activeApps,
      systemSummary,
    };
  }

  /**
   * Generates an end-of-day summary of accomplished tasks and modified files
   */
  async getEndOfDaySummary(): Promise<EndOfDaySummaryData> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();

    const [doneTasks, pendingTasks] = await Promise.all([db.getTasks('done'), db.getTasks('todo')]);

    let filesModifiedToday: { name: string; path: string }[] = [];
    try {
      const files = await computerService.searchFilesLive({
        modifiedAfter: startOfToday,
        limit: 20,
        sortBy: 'modified',
        sortOrder: 'desc',
      });
      filesModifiedToday = files.map((f) => ({ name: f.name, path: f.path }));
    } catch {}

    return {
      date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      completedTasks: doneTasks.filter((t) => t.updatedAt >= startOfToday),
      pendingTasks,
      filesModifiedToday,
    };
  }

  /**
   * Answers "What was I working on?" based on actual verified filesystem modifications and tasks
   */
  async getRecentActivity(days: number = 2): Promise<{
    period: string;
    filesWorkedOn: { name: string; path: string; modifiedAt?: string }[];
    recentTasks: ProductivityTask[];
  }> {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    let filesWorkedOn: { name: string; path: string; modifiedAt?: string }[] = [];
    try {
      const files = await computerService.searchFilesLive({
        modifiedAfter: since,
        limit: 20,
        sortBy: 'modified',
        sortOrder: 'desc',
      });
      filesWorkedOn = files.map((f) => ({ name: f.name, path: f.path, modifiedAt: f.modifiedAt }));
    } catch {}

    const allTasks = await db.getTasks();
    const recentTasks = allTasks.filter((t) => t.updatedAt >= since);

    return {
      period: `Last ${days} day(s)`,
      filesWorkedOn,
      recentTasks,
    };
  }

  /**
   * "What should I focus on today?" / "What should I do today?"
   * Synthesizes due tasks, high-priority items, pending follow-ups, and active goals.
   * Explains factors clearly while keeping the user in control.
   */
  async getWhatShouldIDoToday(): Promise<{
    headline: string;
    focusAreas: { title: string; reason: string; priority: 'high' | 'medium' | 'low' }[];
    summary: string;
  }> {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    const [allTasks, allFollowUps, activeGoals] = await Promise.all([
      db.getTasks('todo'),
      db.getFollowUps('pending'),
      db.getGoals('active'),
    ]);

    const tasksDueToday = allTasks.filter((t) => t.dueDate && t.dueDate.startsWith(todayIso));
    const highPriorityTasks = allTasks.filter((t) => t.priority === 'high' && (!t.dueDate || !t.dueDate.startsWith(todayIso)));
    const urgentFollowUps = allFollowUps.filter((f) => f.dueDate && f.dueDate.startsWith(todayIso));
    const waitingFollowUps = allFollowUps.filter((f) => f.type === 'waiting_for' || f.type === 'pending_approval');

    const focusAreas: { title: string; reason: string; priority: 'high' | 'medium' | 'low' }[] = [];

    for (const t of tasksDueToday) {
      focusAreas.push({
        title: t.title,
        reason: 'Due today',
        priority: 'high',
      });
    }

    for (const f of urgentFollowUps) {
      focusAreas.push({
        title: f.title,
        reason: `Follow-up due today${f.targetPerson ? ` with ${f.targetPerson}` : ''}`,
        priority: 'high',
      });
    }

    for (const t of highPriorityTasks.slice(0, 3)) {
      focusAreas.push({
        title: t.title,
        reason: 'High priority task',
        priority: 'high',
      });
    }

    for (const g of activeGoals.slice(0, 2)) {
      if (g.nextAction) {
        focusAreas.push({
          title: `${g.title}: ${g.nextAction}`,
          reason: `Active goal (${g.progress}% complete)`,
          priority: 'medium',
        });
      }
    }

    let headline = '';
    if (focusAreas.length === 0) {
      headline = "You have no pressing deadlines or urgent tasks due today.";
    } else {
      headline = `You have ${focusAreas.length} items that could use your attention today.`;
    }

    let summary = `**Daily Focus Recommendation**:\n`;
    if (tasksDueToday.length > 0) {
      summary += `- You have **${tasksDueToday.length} task(s) due today**.\n`;
    }
    if (highPriorityTasks.length > 0) {
      summary += `- You have **${highPriorityTasks.length} high-priority task(s)** pending review.\n`;
    }
    if (waitingFollowUps.length > 0) {
      summary += `- You have **${waitingFollowUps.length} item(s) waiting** on external responses.\n`;
    }
    if (activeGoals.length > 0) {
      summary += `- Your active goal **"${activeGoals[0].title}"** is at ${activeGoals[0].progress}%. Next action: *${activeGoals[0].nextAction || 'Continue'}*.\n`;
    }

    return {
      headline,
      focusAreas,
      summary: summary.trim(),
    };
  }

  /**
   * "What did I do today?"
   * Factual Daily Activity Summary combining actual verified filesystem modifications,
   * completed tasks, and running tools.
   */
  async getDailyActivitySummary(): Promise<{
    date: string;
    completedTaskCount: number;
    filesModifiedCount: number;
    completedTasks: string[];
    filesModified: string[];
    narrative: string;
  }> {
    const endOfDay = await this.getEndOfDaySummary();

    const completedNames = endOfDay.completedTasks.map((t) => t.title);
    const fileNames = endOfDay.filesModifiedToday.slice(0, 8).map((f) => f.name);

    let narrative = `Today (${endOfDay.date}):\n`;
    if (endOfDay.completedTasks.length > 0) {
      narrative += `- You completed **${endOfDay.completedTasks.length} task(s)**: ${completedNames.join(', ')}.\n`;
    } else {
      narrative += `- No tasks were marked completed today.\n`;
    }

    if (endOfDay.filesModifiedToday.length > 0) {
      narrative += `- You modified **${endOfDay.filesModifiedToday.length} file(s)** on your device, including: ${fileNames.join(', ')}.\n`;
    } else {
      narrative += `- No files modified today in accessible directories.\n`;
    }

    if (endOfDay.pendingTasks.length > 0) {
      narrative += `- You have **${endOfDay.pendingTasks.length} pending task(s)** for tomorrow.`;
    }

    return {
      date: endOfDay.date,
      completedTaskCount: endOfDay.completedTasks.length,
      filesModifiedCount: endOfDay.filesModifiedToday.length,
      completedTasks: completedNames,
      filesModified: fileNames,
      narrative: narrative.trim(),
    };
  }
}

export const productivityEngine = new ProductivityEngine();

