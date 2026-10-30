import React, { useState, useEffect } from 'react';
import {
  Brain,
  Search,
  Plus,
  Trash2,
} from 'lucide-react';
import { memoryEngine } from '@/services/memory/memoryEngine';
import { MemoryItem, MemoryType } from '@/services/db/database';

export const MemoryPage: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [activeTier, setActiveTier] = useState<MemoryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTier, setNewTier] = useState<MemoryType>('preference');

  const loadMemories = async () => {
    try {
      const items = await memoryEngine.getAll();
      setMemories(items);
    } catch (err) {
      console.error('Failed to load memories:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    memoryEngine.getAll().then((items) => {
      if (!cancelled) setMemories(items);
    }).catch((err) => {
      console.error('Failed to load memories:', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newContent.trim()) return;

    await memoryEngine.save(newKey.trim(), newContent.trim(), newTier);

    setNewKey('');
    setNewContent('');
    setIsAdding(false);
    await loadMemories();
  };

  const handleDelete = async (id: string) => {
    await memoryEngine.delete(id);
    await loadMemories();
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all personal memories stored by Foundry? This action is permanent.')) {
      await memoryEngine.clearAll();
      await loadMemories();
    }
  };

  const filteredMemories = memories.filter((m) => {
    if (activeTier !== 'all' && m.type !== activeTier) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q);
    }
    return true;
  });

  const tierColors: Record<MemoryType, string> = {
    short_term: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    long_term: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
    preference: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    project: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    episodic: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Personal Context &amp; Memory Engine
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Foundry selectively recalls user preferences, active project states, and important facts without cloud data leaks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {memories.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}

          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {/* Tier Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'preference', 'project', 'long_term', 'short_term', 'episodic'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTier(t)}
              className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors cursor-pointer ${
                activeTier === t
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {t.replace('_', ' ')} ({memories.filter((m) => t === 'all' || m.type === t).length})
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            type="text"
            placeholder="Search recalled memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Add Memory Modal */}
      {isAdding && (
        <form onSubmit={handleAdd} className="p-4 rounded-xl bg-[var(--bg-card)] border border-purple-500/40 space-y-3 shadow-lg">
          <div className="text-xs font-semibold text-[var(--text-main)]">Store New Personal Context</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Memory Key (e.g. user_primary_ide, project_language)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-purple-500"
              autoFocus
            />

            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value as MemoryType)}
              className="px-3 py-2 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            >
              <option value="preference">Preference Memory</option>
              <option value="project">Project Memory</option>
              <option value="long_term">Long-term Memory</option>
              <option value="short_term">Short-term Memory</option>
              <option value="episodic">Episodic Memory</option>
            </select>
          </div>

          <textarea
            placeholder="What should Foundry remember? (e.g. User prefers dark mode and uses VS Code on Windows)"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-purple-500"
          />

          <div className="flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newKey.trim() || !newContent.trim()}
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-40 cursor-pointer"
            >
              Store Memory
            </button>
          </div>
        </form>
      )}

      {/* Memories List */}
      <div className="space-y-2">
        {filteredMemories.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--border-subtle)] rounded-xl">
            <Brain className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-2 opacity-50" />
            <p className="text-xs text-[var(--text-muted)]">No memories found in this tier.</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-1">
              Foundry automatically learns your preferences through conversations and tools.
            </p>
          </div>
        ) : (
          filteredMemories.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-purple-500/30 transition-colors gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${tierColors[m.type]}`}>
                    {m.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-main)]">{m.key}</span>
                  <span className="text-[10px] text-[var(--text-faint)] ml-auto">
                    {new Date(m.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)] leading-relaxed">{m.value}</div>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                className="p-1.5 rounded hover:bg-rose-500/10 text-[var(--text-faint)] hover:text-rose-400 transition-colors cursor-pointer flex-shrink-0"
                title="Forget this memory"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
