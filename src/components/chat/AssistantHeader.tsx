import React from 'react';
import {
  Menu,
  Cpu,
  ArrowDownCircle,
  Settings,
} from 'lucide-react';
import { AIProviderStatus } from '@/types/ai';
import { ASSISTANT_TABS } from './assistantSections';

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
  const aiLabel = aiStatus?.isAvailable ? 'On-device AI ready' : 'Set up on-device AI';
  return (
    <header className="h-14 border-b border-[var(--border-subtle)] px-1.5 sm:px-4 flex items-center justify-between gap-1 sm:gap-3 flex-shrink-0 bg-[var(--bg-secondary)]/50 min-w-0">
      {/* Left: conversation history (mobile) + brand */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden touch-target rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          title="Conversation history"
          aria-label="Open conversation history"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-xs flex-shrink-0" aria-hidden="true">
          F
        </div>
        <div className="hidden sm:block">
          <span className="font-semibold text-sm text-[var(--text-main)]">Foundry</span>
          <span className="text-[10px] text-emerald-500 font-medium ml-2 hidden sm:inline">● Connected</span>
        </div>
      </div>

      {/* Center: section tabs (desktop). Mobile uses the bottom bar instead. */}
      <nav aria-label="Workspace sections" className="hidden md:flex flex-1 min-w-0 mx-1 sm:mx-2 overflow-x-auto scrollbar-none py-1">
        <div className="flex items-center bg-[var(--bg-tertiary)] p-0.5 rounded-lg border border-[var(--border-subtle)] text-xs w-max space-x-0.5">
          {ASSISTANT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  active ? `bg-[var(--bg-card)] ${tab.color} font-medium shadow-xs` : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.color}`} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Right: on-device AI, app update, settings */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onOpenLocalAISetup}
          className={`touch-target sm:min-w-0 flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex-shrink-0 ${
            aiStatus?.isAvailable
              ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}
          title={aiLabel}
          aria-label={aiLabel}
        >
          <Cpu className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{aiStatus?.isAvailable ? 'Local AI' : 'Install AI'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenUpdateModal}
          className="touch-target sm:min-w-0 flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer flex-shrink-0"
          title="App update"
          aria-label="App update"
        >
          <ArrowDownCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-blue-400" aria-hidden="true" />
          <span className="hidden sm:inline">Update</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="touch-target rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer flex-shrink-0"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
