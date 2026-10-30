import React from 'react';
import { Sun, MessageSquare, Hourglass, CheckCircle2, Target, FolderSync, Zap, Brain, Activity, Link2 } from 'lucide-react';
import type { AssistantTabType } from './AssistantHeader';

export interface AssistantTabDef {
  id: AssistantTabType;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** Tailwind text colour used for the active tab and its icon. */
  color: string;
  /** Shown directly in the mobile bottom bar (the rest go under "More"). */
  primaryOnMobile?: boolean;
}

/** Single source of truth for the workspace sections (desktop tab strip and mobile bottom bar). */
export const ASSISTANT_TABS: AssistantTabDef[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, color: 'text-blue-400', primaryOnMobile: true },
  { id: 'today', label: 'Today', icon: Sun, color: 'text-amber-400', primaryOnMobile: true },
  { id: 'pending', label: 'Pending', icon: Hourglass, color: 'text-cyan-400', primaryOnMobile: true },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle2, color: 'text-blue-400', primaryOnMobile: true },
  { id: 'goals', label: 'Goals', icon: Target, color: 'text-emerald-400' },
  { id: 'cleanup', label: 'Clean-Up', icon: FolderSync, color: 'text-cyan-400' },
  { id: 'automations', label: 'Automations', icon: Zap, color: 'text-amber-400' },
  { id: 'memory', label: 'Memory', icon: Brain, color: 'text-purple-400' },
  { id: 'analytics', label: 'Graphs', icon: Activity, color: 'text-emerald-400' },
  { id: 'integrations', label: 'Integrations', icon: Link2, color: 'text-blue-400' },
];

