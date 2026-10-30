import React, { useState } from 'react';
import {
  Folder,
  ExternalLink,
  Check,
  Calendar,
  Layers,
} from 'lucide-react';
import { IndexedFolder } from '@/types/file';
import { useApp } from '@/stores/AppContext';

interface FolderResultCardProps {
  folder: IndexedFolder;
}

export const FolderResultCard: React.FC<FolderResultCardProps> = ({ folder }) => {
  const { openFile, revealFile } = useApp();
  const [hasOpened, setHasOpened] = useState(false);

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown';
    try {
      const d = new Date(isoString);
      const isToday = new Date().toDateString() === d.toDateString();
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (isToday) {
        return `today at ${timeStr}`;
      }
      return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${timeStr}`;
    } catch {
      return isoString;
    }
  };

  const handleOpen = async () => {
    setHasOpened(true);
    await openFile(folder.path);
    setTimeout(() => setHasOpened(false), 2500);
  };

  const handleReveal = async () => {
    await revealFile(folder.path);
  };

  return (
    <div className="group p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--text-faint)] transition-all shadow-xs flex flex-col justify-between space-y-3">
      <div className="flex items-start justify-between space-x-3">
        <div className="flex items-start space-x-3 min-w-0">
          <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500 flex-shrink-0">
            <Folder className="w-5 h-5 fill-amber-500/20" aria-hidden="true" />
          </div>

          <div className="min-w-0 space-y-1">
            <h4
              className="text-xs font-semibold text-[var(--text-main)] truncate m-0 group-hover:text-amber-400 transition-colors"
              title={folder.name}
            >
              📁 {folder.name}
            </h4>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
              {folder.itemCount !== undefined && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] flex items-center space-x-1 font-medium text-[var(--text-muted)]">
                  <Layers className="w-3 h-3" />
                  <span>{folder.itemCount} items</span>
                </span>
              )}
              <span>·</span>
              <span className="flex items-center space-x-1">
                <Calendar className="w-3 h-3 text-[var(--text-faint)]" />
                <span>Created {formatDate(folder.createdAt || folder.modifiedAt)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Path preview */}
      <div className="text-[10px] text-[var(--text-faint)] font-mono truncate bg-[var(--bg-tertiary)]/50 px-2 py-1 rounded">
        {folder.path}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]/60">
        <button
          type="button"
          onClick={handleReveal}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center space-x-1 py-1 px-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Show in File Explorer"
        >
          <Folder className="w-3.5 h-3.5" />
          <span>Show in Explorer</span>
        </button>

        <button
          type="button"
          onClick={handleOpen}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            hasOpened
              ? 'bg-emerald-600 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
          }`}
          aria-label={`Open folder ${folder.name}`}
        >
          {hasOpened ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Opening...</span>
            </>
          ) : (
            <>
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Folder</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
