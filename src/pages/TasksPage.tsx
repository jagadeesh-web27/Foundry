import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Plus,
  Trash2,
  Calendar,
  Check,
} from 'lucide-react';
import { productivityEngine } from '@/services/productivity/productivityEngine';
import { ProductivityTask } from '@/services/db/database';

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<ProductivityTask[]>([]);
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newDueDate, setNewDueDate] = useState('');

  const loadTasks = async () => {
    try {
      const items = await productivityEngine.listTasks();
      setTasks(items);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    productivityEngine.listTasks().then((items) => {
      if (!cancelled) setTasks(items);
    }).catch((err) => {
      console.error('Failed to load tasks:', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await productivityEngine.createTask({
      title: newTitle.trim(),
      priority: newPriority,
      dueDate: newDueDate || undefined,
    });

    setNewTitle('');
    setNewDueDate('');
    setIsCreating(false);
    await loadTasks();
  };

  const handleToggleStatus = async (task: ProductivityTask) => {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await productivityEngine.updateTaskStatus(task.id, nextStatus);
    await loadTasks();
  };

  const handleDelete = async (id: string) => {
    await productivityEngine.deleteTask(id);
    await loadTasks();
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-blue-500" />
            Productivity Tasks
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Organize personal goals, follow-ups, and device tasks managed by Foundry AI.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mt-4 text-xs">
        {(['all', 'todo', 'in_progress', 'done'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer capitalize ${
              filter === tab
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {tab.replace('_', ' ')} ({tasks.filter((t) => tab === 'all' || t.status === tab).length})
          </button>
        ))}
      </div>

      {/* Create Task Modal / Form */}
      {isCreating && (
        <form onSubmit={handleCreate} className="mt-4 p-4 rounded-xl bg-[var(--bg-card)] border border-blue-500/40 space-y-3 shadow-lg">
          <div className="text-xs font-semibold text-[var(--text-main)]">Add New Task</div>
          <input
            type="text"
            placeholder="What needs to be done? (e.g. Submit quarterly finance report)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-blue-500"
            autoFocus
          />

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Priority:</span>
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setNewPriority(p)}
                  className={`px-2 py-1 rounded text-[11px] font-medium capitalize cursor-pointer ${
                    newPriority === p
                      ? p === 'high'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : p === 'medium'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Due Date:</span>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
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
                disabled={!newTitle.trim()}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                Create Task
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Task List */}
      <div className="mt-4 space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--border-subtle)] rounded-xl">
            <CheckCircle2 className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-2 opacity-50" />
            <p className="text-xs text-[var(--text-muted)]">No tasks found in this view.</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-1">
              You can create tasks manually or ask Foundry in chat: &quot;Remind me to finish report tomorrow&quot;.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                task.status === 'done'
                  ? 'bg-[var(--bg-card)]/40 border-[var(--border-subtle)]/50 opacity-60'
                  : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-blue-500/30'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(task)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors cursor-pointer flex-shrink-0 ${
                    task.status === 'done'
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-[var(--text-muted)] hover:border-blue-400'
                  }`}
                >
                  {task.status === 'done' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-medium truncate ${
                      task.status === 'done'
                        ? 'line-through text-[var(--text-muted)]'
                        : 'text-[var(--text-main)]'
                    }`}
                  >
                    {task.title}
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-faint)] mt-0.5">
                    {task.dueDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    <span
                      className={`font-semibold capitalize ${
                        task.priority === 'high'
                          ? 'text-rose-400'
                          : task.priority === 'medium'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {task.priority} Priority
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="p-1.5 rounded hover:bg-rose-500/10 text-[var(--text-faint)] hover:text-rose-400 transition-colors cursor-pointer"
                  title="Delete task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
