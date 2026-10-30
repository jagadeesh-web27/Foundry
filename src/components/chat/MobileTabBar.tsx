import React, { useEffect, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { AssistantTabType } from './AssistantHeader';
import { ASSISTANT_TABS } from './assistantSections';

interface MobileTabBarProps {
  activeTab: AssistantTabType;
  onSelectTab: (tab: AssistantTabType) => void;
}

/**
 * Bottom navigation for phones (hidden from md up, where the header tab strip is shown).
 * Primary sections are one tap away; the rest open in a "More" sheet.
 */
export const MobileTabBar: React.FC<MobileTabBarProps> = ({ activeTab, onSelectTab }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = ASSISTANT_TABS.filter((t) => t.primaryOnMobile);
  const secondary = ASSISTANT_TABS.filter((t) => !t.primaryOnMobile);
  const secondaryActive = secondary.some((t) => t.id === activeTab);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const select = (tab: AssistantTabType) => {
    setMoreOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="More sections">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={() => setMoreOpen(false)} />
          <div className="relative rounded-t-2xl bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] p-3 pb-[calc(0.75rem+var(--safe-bottom))]">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-sm font-semibold text-[var(--text-main)]">More</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="touch-target rounded-lg text-[var(--text-muted)]" aria-label="Close">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {secondary.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => select(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center justify-center gap-1.5 min-h-[72px] rounded-xl border text-sm transition-colors ${
                      active
                        ? 'bg-[var(--bg-card)] border-[var(--accent-active)] text-[var(--accent-active)] font-semibold'
                        : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-main)] active:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${tab.color}`} aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Workspace sections"
        className="md:hidden flex-shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] pb-[var(--safe-bottom)]"
      >
        <div className="grid grid-cols-5">
          {primary.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => select(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[12px] transition-colors ${
                  active ? 'text-[var(--accent-active)] font-semibold' : 'text-[var(--text-muted)] active:text-[var(--text-main)]'
                }`}
              >
                {active && <span className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-[var(--accent-active)]" aria-hidden="true" />}
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[12px] transition-colors ${
              secondaryActive ? 'text-[var(--accent-active)] font-semibold' : 'text-[var(--text-muted)] active:text-[var(--text-main)]'
            }`}
          >
            {secondaryActive && <span className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-[var(--accent-active)]" aria-hidden="true" />}
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
