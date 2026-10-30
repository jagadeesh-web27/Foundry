import React from 'react';
import { Outlet } from 'react-router-dom';
import { SkipLink } from '@/components/common/SkipLink';
import { StatusBar } from './StatusBar';

export const AppShell: React.FC = () => {
  return (
    <div className="app-shell flex flex-col w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-main)]">
      <SkipLink />
      <main
        id="main-content"
        tabIndex={-1}
        className="app-shell-main flex-1 min-h-0 outline-none flex flex-col"
        role="main"
        aria-label="Foundry Local Computer Assistant"
      >
        <Outlet />
      </main>
      <div className="hidden md:block flex-shrink-0">
        <StatusBar />
      </div>
    </div>
  );
};

