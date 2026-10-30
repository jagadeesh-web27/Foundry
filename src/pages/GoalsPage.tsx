import React, { useState, useEffect } from 'react';
import { Target, CheckCircle2, Circle, Plus, Trash2, Sparkles } from 'lucide-react';
import { goalEngine } from '@/services/goals/goalEngine';
import { db, GoalItem } from '@/services/db/database';

export const GoalsPage: React.FC = () => {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');

  // New Goal Modal state
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Career');
  const [newSteps, setNewSteps] = useState('');

  const loadGoals = async () => {
    try {
      const items = await db.getGoals(filter === 'all' ? undefined : filter);
      setGoals(items);
    } catch (err) {
      console.error('Failed to load goals:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    db.getGoals(filter === 'all' ? undefined : filter)
      .then((items) => {
        if (!cancelled) setGoals(items);
      })
      .catch((err) => {
        console.error('Failed to load goals:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const stepList = newSteps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    await goalEngine.createGoal({
      title: newTitle.trim(),
      category: newCategory.trim(),
      steps: stepList.length > 0 ? stepList : undefined,
    });

    setNewTitle('');
    setNewSteps('');
    setShowModal(false);
    await loadGoals();
  };

  const handleToggleStep = async (goalId: string, stepId: string) => {
    const updated = await goalEngine.toggleStep(goalId, stepId);
    if (updated) {
      setGoals((prev) => prev.map((g) => (g.id === goalId ? updated : g)));
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (confirm('Delete this goal?')) {
      await goalEngine.deleteGoal(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6 text-[var(--text-main)] select-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Target className="w-4 h-4" />
            <span>Goal Mode & Progress Memory</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight m-0">Goals & Objectives</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Break long-term ambitions into milestones with automatic continuity tracking
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <div className="flex bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter('active')}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                filter === 'active' ? 'bg-[var(--bg-card)] font-medium text-emerald-400' : 'text-[var(--text-muted)]'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                filter === 'completed' ? 'bg-[var(--bg-card)] font-medium text-emerald-400' : 'text-[var(--text-muted)]'
              }`}
            >
              Completed
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                filter === 'all' ? 'bg-[var(--bg-card)] font-medium text-emerald-400' : 'text-[var(--text-muted)]'
              }`}
            >
              All
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* Goal Cards */}
      <div className="space-y-4">
        {goals.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--border-subtle)] rounded-2xl p-8 max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold m-0">No goals found</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Create a goal to track your interview prep, project release, or learning roadmap with progress memory.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Goal</span>
            </button>
          </div>
        ) : (
          goals.map((goal) => (
            <div
              key={goal.id}
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs space-y-3 hover:border-emerald-500/30 transition-colors"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                      {goal.category}
                    </span>
                    {goal.status === 'completed' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                        COMPLETED
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold m-0 text-[var(--text-main)]">{goal.title}</h3>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-sm font-extrabold text-emerald-400">{goal.progress}%</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                    title="Delete Goal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>

              {/* Next Action */}
              {goal.nextAction && (
                <div className="flex items-center space-x-1.5 text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)]/50 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>
                    Next Action: <strong className="text-[var(--text-main)]">{goal.nextAction}</strong>
                  </span>
                </div>
              )}

              {/* Milestones Checklist */}
              {goal.steps && goal.steps.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Milestones ({goal.steps.filter((s) => s.completed).length}/{goal.steps.length})
                  </span>
                  <div className="space-y-1">
                    {goal.steps.map((step) => (
                      <div
                        key={step.id}
                        onClick={() => handleToggleStep(goal.id, step.id)}
                        className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] cursor-pointer text-xs transition-colors"
                      >
                        {step.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                        )}
                        <span className={step.completed ? 'line-through text-[var(--text-muted)]' : 'font-medium'}>
                          {step.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold m-0">Create New Goal</h3>

            <form onSubmit={handleCreateGoal} className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Goal Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Prepare for Interview, Learn Rust, Ship Foundry v2"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Category</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Career, Development, Health, Personal"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Milestones (one per line)
                </label>
                <textarea
                  value={newSteps}
                  onChange={(e) => setNewSteps(e.target.value)}
                  rows={4}
                  placeholder={`Review resume\nPrepare project walk-throughs\nPractice system design questions\nReview company background`}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer"
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
