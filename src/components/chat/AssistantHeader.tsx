import React from 'react';
import {
  Menu,
  Sun,
  MessageSquare,
  Hourglass,
  CheckCircle2,
  Target,
  FolderSync,
  Zap,
  Brain,
  Activity,
  Link2,
  Cpu,
  ArrowDownCircle,
  Settings,
} from 'lucide-react';
import { AIProviderStatus } from '@/types/ai';

export type AssistantTabType =
  | 'chat'
  | 'today'
  | 'pending'
  | 'goals'
  | 'cleanup'
  | 'analytics'
  | 'tasks'
  | 'automations'
  | 'integrations'
  | 'memory';

interface AssistantHeaderProps {
  onToggleSidebar: () => void;
  activeTab: AssistantTabType;
  onSelectTab: (tab: AssistantTabType) => void;
  aiStatus: AIProviderStatus;
  onOpenLocalAISetup: () => void;
  onOpenUpdateModal: () => void;
  onOpenSettings: () => void;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  onToggleSidebar,
  activeTab,
  onSelectTab,
  aiStatus,
  onOpenLocalAISetup,
  onOpenUpdateModal,
  onOpenSettings,
}) => {
  return (
    <header className="h-14 border-b border-[var(--border-subtle)] px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-3 flex-shrink-0 bg-[var(--bg-secondary)]/50 min-w-0">
      {/* Left: Mobile Sidebar Toggle + Brand */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          title="Toggle History"
          aria-label="Toggle Conversation History"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-xs flex-shrink-0">
          F
        </div>
        <div className="hidden xs:block sm:block">
          <span className="font-semibold text-sm text-[var(--text-main)]">Foundry</span>
          <span className="text-[10px] text-emerald-500 font-medium ml-2 hidden sm:inline">● Connected</span>
        </div>
      </div>

      {/* Center: Navigation Tabs (Desktop only - Horizontally Scrollable) */}
      <nav aria-label="Assistant workspace sections" className="hidden md:flex flex-1 min-w-0 mx-1 sm:mx-2 overflow-x-auto scrollbar-none py-1">
        <div className="flex items-center bg-[var(--bg-tertiary)] p-0.5 rounded-lg border border-[var(--border-subtle)] text-xs w-max space-x-0.5">
          <button
            type="button"
            onClick={() => onSelectTab('today')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'today'
                ? 'bg-[var(--bg-card)] text-amber-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" focusable="false" />
            <span>Today</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('chat')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'chat'
                ? 'bg-[var(--bg-card)] text-blue-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('pending')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'pending'
                ? 'bg-[var(--bg-card)] text-cyan-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Hourglass className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" focusable="false" />
            <span>Pending</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('tasks')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'tasks'
                ? 'bg-[var(--bg-card)] text-blue-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Tasks</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('goals')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'goals'
                ? 'bg-[var(--bg-card)] text-emerald-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Target className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Goals</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('cleanup')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'cleanup'
                ? 'bg-[var(--bg-card)] text-cyan-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <FolderSync className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Clean-Up</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('automations')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'automations'
                ? 'bg-[var(--bg-card)] text-amber-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Automations</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('memory')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'memory'
                ? 'bg-[var(--bg-card)] text-purple-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Brain className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Memory</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('analytics')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-[var(--bg-card)] text-emerald-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Graphs</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('integrations')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === 'integrations'
                ? 'bg-[var(--bg-card)] text-blue-400 font-medium shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" focusable="false" />
            <span>Integrations</span>
          </button>
        </div>
      </nav>

      {/* Right: Local AI + Direct Update + Settings */}
      <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
        <button
          type="button"
          onClick={onOpenLocalAISetup}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex-shrink-0 ${
            aiStatus?.isAvailable
              ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse'
          }`}
          title="Foundry Standalone On-Device Local AI"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{aiStatus?.isAvailable ? 'Local AI' : 'Install AI'}</span>
          <span className="sm:hidden">{aiStatus?.isAvailable ? 'AI' : 'Setup'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenUpdateModal}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer flex-shrink-0"
          title="Direct App Sync & Update"
        >
          <ArrowDownCircle className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Update</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer flex-shrink-0"
          title="Settings"
          aria-label="Application Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
