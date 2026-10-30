import React, { Suspense } from 'react';
import { AssistantTabType } from './AssistantHeader';
import { TodayPage } from '@/pages/TodayPage';
import { PendingPage } from '@/pages/PendingPage';

const GoalsPage = React.lazy(() => import('@/pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const CleanupPage = React.lazy(() => import('@/pages/CleanupPage').then((m) => ({ default: m.CleanupPage })));
const AnalyticsPage = React.lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const TasksPage = React.lazy(() => import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const AutomationsPage = React.lazy(() => import('@/pages/AutomationsPage').then((m) => ({ default: m.AutomationsPage })));
const IntegrationsPage = React.lazy(() => import('@/pages/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const MemoryPage = React.lazy(() => import('@/pages/MemoryPage').then((m) => ({ default: m.MemoryPage })));

interface AssistantTabsProps {
  activeTab: AssistantTabType;
  onExecuteQuickAction: (query: string) => void;
}

export const AssistantTabs: React.FC<AssistantTabsProps> = ({
  activeTab,
  onExecuteQuickAction,
}) => {
  if (activeTab === 'chat') return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center text-xs text-[var(--text-faint)]">
            Loading section...
          </div>
        }
      >
        {activeTab === 'today' && <TodayPage onExecuteQuickAction={onExecuteQuickAction} />}
        {activeTab === 'pending' && <PendingPage />}
        {activeTab === 'goals' && <GoalsPage />}
        {activeTab === 'cleanup' && <CleanupPage />}
        {activeTab === 'analytics' && <AnalyticsPage />}
        {activeTab === 'tasks' && <TasksPage />}
        {activeTab === 'automations' && <AutomationsPage />}
        {activeTab === 'integrations' && <IntegrationsPage />}
        {activeTab === 'memory' && <MemoryPage />}
      </Suspense>
    </div>
  );
};
