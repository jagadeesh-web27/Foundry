/**
 * Foundry Goal Engine
 * Manages long-term goals, milestone sub-steps, and progress memory.
 * Enables conversational continuity: "Continue my interview preparation" -> resumes right where you left off.
 */

import { db, GoalItem, GoalMilestone } from '@/services/db/database';

export interface CreateGoalArgs {
  title: string;
  category?: string;
  targetDate?: string;
  nextAction?: string;
  steps?: string[];
}

export class GoalEngine {
  /**
   * Create a new goal with milestone checklist
   */
  async createGoal(args: CreateGoalArgs): Promise<GoalItem> {
    const milestones: GoalMilestone[] = (args.steps || []).map((stepTitle, idx) => ({
      id: `step_${Date.now()}_${idx}`,
      title: stepTitle.trim(),
      completed: false,
    }));

    const goal: GoalItem = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: args.title.trim(),
      category: args.category?.trim() || 'General',
      progress: 0,
      status: 'active',
      targetDate: args.targetDate,
      nextAction: args.nextAction?.trim() || (milestones.length > 0 ? milestones[0].title : undefined),
      steps: milestones,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.upsertGoal(goal);
    return goal;
  }

  /**
   * List goals filtered by status
   */
  async listGoals(status?: 'active' | 'completed' | 'paused' | 'all'): Promise<GoalItem[]> {
    return db.getGoals(status || 'active');
  }

  /**
   * Retrieve a specific goal by ID
   */
  async getGoal(id: string): Promise<GoalItem | null> {
    return db.getGoalById(id);
  }

  /**
   * Update progress percentage and next action
   */
  async updateGoalProgress(
    id: string,
    progress: number,
    nextAction?: string,
    status?: 'active' | 'completed' | 'paused'
  ): Promise<boolean> {
    const goal = await db.getGoalById(id);
    if (!goal) return false;

    goal.progress = Math.min(100, Math.max(0, Math.round(progress)));
    if (nextAction !== undefined) goal.nextAction = nextAction;
    if (status) goal.status = status;
    if (goal.progress >= 100) goal.status = 'completed';
    goal.updatedAt = new Date().toISOString();

    await db.upsertGoal(goal);
    return true;
  }

  /**
   * Toggle a milestone step completion and recalculate overall progress
   */
  async toggleStep(goalId: string, stepId: string): Promise<GoalItem | null> {
    const goal = await db.getGoalById(goalId);
    if (!goal) return null;

    const step = goal.steps.find((s) => s.id === stepId);
    if (step) {
      step.completed = !step.completed;

      // Recalculate progress based on completed steps
      const completedCount = goal.steps.filter((s) => s.completed).length;
      goal.progress = goal.steps.length > 0 ? Math.round((completedCount / goal.steps.length) * 100) : goal.progress;

      // Find first uncompleted step for nextAction
      const nextStep = goal.steps.find((s) => !s.completed);
      goal.nextAction = nextStep ? nextStep.title : 'All milestones complete';
      if (goal.progress >= 100) {
        goal.status = 'completed';
      } else if (goal.status === 'completed') {
        goal.status = 'active';
      }

      goal.updatedAt = new Date().toISOString();
      await db.upsertGoal(goal);
    }

    return goal;
  }

  /**
   * Delete a goal
   */
  async deleteGoal(id: string): Promise<boolean> {
    await db.deleteGoal(id);
    return true;
  }

  /**
   * Conversational continuity: Finds the most relevant active goal to resume work
   */
  async resumeGoal(query: string): Promise<{
    found: boolean;
    goal?: GoalItem;
    message: string;
  }> {
    const goals = await db.getGoals('active');
    if (goals.length === 0) {
      return {
        found: false,
        message: "You don't currently have any active goals. Would you like to create one?",
      };
    }

    const lower = query.toLowerCase();
    let bestGoal = goals.find((g) => lower.includes(g.title.toLowerCase()) || g.title.toLowerCase().includes(lower));

    if (!bestGoal) {
      // Token match
      const words = lower.split(/\s+/).filter((w) => w.length > 2);
      bestGoal = goals.find((g) => words.some((w) => g.title.toLowerCase().includes(w)));
    }

    if (!bestGoal) {
      // Default to most recently updated active goal
      bestGoal = goals.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    }

    return {
      found: true,
      goal: bestGoal,
      message: `Resuming **${bestGoal.title}** (${bestGoal.progress}% complete).\nNext step: ${bestGoal.nextAction || 'Review next actions'}`,
    };
  }
}

export const goalEngine = new GoalEngine();
