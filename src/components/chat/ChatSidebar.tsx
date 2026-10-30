import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
} from 'lucide-react';
import { StoredConversation } from '@/services/db/database';

interface ChatSidebarProps {
  conversations: StoredConversation[];
  activeConversationId: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onClearCurrentChat: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations,
  activeConversationId,
  isOpen,
  onToggleOpen,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onClearCurrentChat,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const startRename = (conv: StoredConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const saveRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      onRenameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      onDeleteConversation(id);
    }
  };

  // Group conversations by date
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const sevenDaysStart = todayStart - 7 * 24 * 60 * 60 * 1000;

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groups: { label: string; items: StoredConversation[] }[] = [
    {
      label: 'Today',
      items: filtered.filter((c) => new Date(c.updatedAt).getTime() >= todayStart),
    },
    {
      label: 'Yesterday',
      items: filtered.filter((c) => {
        const t = new Date(c.updatedAt).getTime();
        return t >= yesterdayStart && t < todayStart;
      }),
    },
    {
      label: 'Previous 7 Days',
      items: filtered.filter((c) => {
        const t = new Date(c.updatedAt).getTime();
        return t >= sevenDaysStart && t < yesterdayStart;
      }),
    },
    {
      label: 'Older',
      items: filtered.filter((c) => new Date(c.updatedAt).getTime() < sevenDaysStart),
    },
  ].filter((g) => g.items.length > 0);

  const handleSelect = (id: string) => {
    onSelectConversation(id);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  const handleNew = () => {
    onNewChat();
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  if (!isOpen) {
    return (
      <div className="hidden md:flex p-2 border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex-col items-center flex-shrink-0">
        <button
          type="button"
          onClick={onToggleOpen}
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          title="Open Conversation History"
          aria-label="Open Conversation History"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleNew}
          className="mt-2 p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
          title="New Chat"
          aria-label="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
        onClick={onToggleOpen}
        aria-hidden="true"
      />
      <aside
        className="fixed md:static inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-main)] select-none flex-shrink-0 shadow-2xl md:shadow-none"
        aria-label="Conversation History"
      >
        {/* Top Controls */}
        <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleNew}
            className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        <button
          type="button"
          onClick={onToggleOpen}
          className="touch-target sm:p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          title="Close Sidebar"
          aria-label="Close Sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* History Search */}
      <div className="px-3 pt-3">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-faint)]" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Grouped Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.length === 0 ? (
          <div className="text-center py-8 px-4 text-xs text-[var(--text-muted)]">
            {searchQuery ? 'No matching conversations' : 'No previous conversations yet'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const isEditing = editingId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelect(conv.id)}
                      className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-blue-600/15 text-blue-400 font-medium border border-blue-500/30'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate flex-1 mr-2">
                        <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(conv.id, e as any);
                              if (e.key === 'Escape') cancelRename(e as any);
                            }}
                            autoFocus
                            className="w-full px-1 py-0.5 text-xs bg-[var(--bg-primary)] border border-blue-500 rounded text-[var(--text-main)] outline-none"
                          />
                        ) : (
                          <span className="truncate">{conv.title}</span>
                        )}
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => saveRename(conv.id, e)}
                              className="touch-target sm:p-1 hover:text-emerald-400 cursor-pointer"
                              title="Save Title"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              className="touch-target sm:p-1 hover:text-rose-400 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => startRename(conv, e)}
                              className="touch-target sm:p-1 text-[var(--text-faint)] hover:text-[var(--text-main)] cursor-pointer"
                              title="Rename Conversation"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(conv.id, e)}
                              className="touch-target sm:p-1 text-[var(--text-faint)] hover:text-rose-400 cursor-pointer"
                              title="Delete Conversation"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Footer Actions */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
        <button
          type="button"
          onClick={onClearCurrentChat}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 text-xs transition-colors cursor-pointer"
          title="Clear messages in the current conversation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear Current Chat</span>
        </button>

        <div className="text-center text-[10px] text-[var(--text-faint)]">
          {conversations.length} saved conversation{conversations.length === 1 ? '' : 's'}
        </div>
      </div>
    </aside>
    </>
  );
};
