import React, { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  FileCode,
  Archive,
  ExternalLink,
  Folder,
  Check,
  Sparkles,
} from 'lucide-react';
import { IndexedFile, ComputerFileType } from '@/types/file';
import { useApp } from '@/stores/AppContext';

interface FileResultCardProps {
  file: IndexedFile;
}

const TYPE_ICONS: Record<ComputerFileType, React.ComponentType<{ className?: string }>> = {
  Document: FileText,
  Image: ImageIcon,
  Video: Video,
  Audio: Music,
  Spreadsheet: FileSpreadsheet,
  Presentation: FileText,
  Code: FileCode,
  Archive: Archive,
  Other: FileText,
};

const TYPE_COLORS: Record<ComputerFileType, string> = {
  Document: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  Image: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  Video: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Audio: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  Spreadsheet: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
  Presentation: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  Code: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
  Archive: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  Other: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
};

export const FileResultCard: React.FC<FileResultCardProps> = ({ file }) => {
  const { openFile, revealFile } = useApp();
  const [hasOpened, setHasOpened] = useState(false);

  const Icon = TYPE_ICONS[file.fileType] || FileText;
  const colorClasses = TYPE_COLORS[file.fileType] || TYPE_COLORS.Other;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const handleOpen = async () => {
    setHasOpened(true);
    await openFile(file.path);
    setTimeout(() => setHasOpened(false), 2500);
  };

  const handleReveal = async () => {
    await revealFile(file.path);
  };

  // Get display folder (e.g. "Downloads" or "Documents" or "Mysore Trip")
  const parts = file.path.split(/[\\/]/);
  const folderName = parts.length > 1 ? parts[parts.length - 2] : 'Files';

  return (
    <div className="group p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--text-faint)] transition-all shadow-xs flex flex-col justify-between space-y-3">
      <div className="flex items-start justify-between space-x-3">
        <div className="flex items-start space-x-3 min-w-0">
          <div className={`p-2 rounded-lg border flex-shrink-0 ${colorClasses}`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 space-y-1">
            <h4
              className="text-xs font-semibold text-[var(--text-main)] truncate m-0 group-hover:text-blue-400 transition-colors"
              title={file.name}
            >
              {file.name}
            </h4>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
              <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] flex items-center space-x-1 font-medium text-[var(--text-muted)]">
                <Folder className="w-3 h-3" />
                <span>{folderName}</span>
              </span>
              <span>·</span>
              <span>{formatBytes(file.size)}</span>
              <span>·</span>
              <span>Modified {formatDate(file.modifiedAt)}</span>
            </div>

            {/* Badges for special classifications */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              {file.isScreenRecording && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  Screen Recording
                </span>
              )}
              {file.qualityScore && file.qualityScore > 0.85 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1 font-medium">
                  <Sparkles className="w-3 h-3" />
                  <span>High Quality Photo</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Path preview */}
      <div className="text-[10px] text-[var(--text-faint)] font-mono truncate bg-[var(--bg-tertiary)]/50 px-2 py-1 rounded">
        {file.path}
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
          <span>Show in Folder</span>
        </button>

        <button
          type="button"
          onClick={handleOpen}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            hasOpened
              ? 'bg-emerald-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
          }`}
          aria-label={`Open file ${file.name}`}
        >
          {hasOpened ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Opening...</span>
            </>
          ) : (
            <>
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open File</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
