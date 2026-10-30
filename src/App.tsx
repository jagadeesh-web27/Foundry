import React, { Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/stores/ThemeContext';
import { AppProvider } from '@/stores/AppContext';
import { AppShell } from '@/components/layout/AppShell';
import { MainAssistantPage } from '@/pages/MainAssistantPage';

const KnowledgePage = React.lazy(() => import('@/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const GraphPage = React.lazy(() => import('@/pages/GraphPage').then((m) => ({ default: m.GraphPage })));
const NotesPage = React.lazy(() => import('@/pages/NotesPage').then((m) => ({ default: m.NotesPage })));
const CollectionsPage = React.lazy(() => import('@/pages/CollectionsPage').then((m) => ({ default: m.CollectionsPage })));

export function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <HashRouter>
          <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] text-[var(--text-main)]">Loading...</div>}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<MainAssistantPage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="/graph" element={<GraphPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/collections" element={<CollectionsPage />} />
                <Route path="*" element={<MainAssistantPage />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
