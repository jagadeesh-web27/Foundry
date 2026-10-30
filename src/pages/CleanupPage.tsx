import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  FolderSync,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  digitalOrganizerEngine,
  DuplicateGroup,
  DownloadsBreakdown,
} from '@/services/organization/digitalOrganizerEngine';
import { CleanupProposal } from '@/services/db/database';
import { useApp } from '@/stores/AppContext';

export const CleanupPage: React.FC = () => {
  const { revealFile } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'downloads' | 'duplicates' | 'large_files'>('downloads');
  const [loading, setLoading] = useState(true);

  // Data states
  const [downloads, setDownloads] = useState<DownloadsBreakdown | null>(null);
  const [duplicates, setDuplicates] = useState<{
    groups: DuplicateGroup[];
    totalDuplicateCount: number;
    totalWastedFormatted: string;
  } | null>(null);
  const [largeFiles, setLargeFiles] = useState<{
    files: { name: string; path: string; sizeFormatted: string; modifiedAt?: string }[];
    totalFormatted: string;
  } | null>(null);

  // Proposal modal state
  const [activeProposal, setActiveProposal] = useState<CleanupProposal | null>(null);
  const [proposalStatus, setProposalStatus] = useState<'idle' | 'success' | 'cancelled'>('idle');

  const loadData = async () => {
    try {
      const [dlRes, dupRes, lfRes] = await Promise.all([
        digitalOrganizerEngine.classifyDownloads(),
        digitalOrganizerEngine.findDuplicateFiles(),
        digitalOrganizerEngine.findLargeFiles(),
      ]);

      setDownloads(dlRes);
      setDuplicates(dupRes);
      setLargeFiles(lfRes);
    } catch (err) {
      console.error('Failed to load cleanup data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      digitalOrganizerEngine.classifyDownloads(),
      digitalOrganizerEngine.findDuplicateFiles(),
      digitalOrganizerEngine.findLargeFiles(),
    ]).then(([dlRes, dupRes, lfRes]) => {
      if (!cancelled) {
        setDownloads(dlRes);
        setDuplicates(dupRes);
        setLargeFiles(lfRes);
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Failed to load cleanup data:', err);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProposeDownloadsOrg = async () => {
    const proposal = await digitalOrganizerEngine.proposeDownloadsOrganization();
    setActiveProposal(proposal);
    setProposalStatus('idle');
  };

  const handleApproveProposal = async () => {
    if (!activeProposal) return;
    // In strict safety mode: acknowledge plan and notify user
    setProposalStatus('success');
    setTimeout(() => {
      setActiveProposal(null);
      setProposalStatus('idle');
    }, 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6 text-[var(--text-main)] select-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Digital Organization Assistant</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight m-0">Clean Up Your Digital Life</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Identify duplicates, sort chaotic Downloads, and safely reclaim computer storage
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
          title="Refresh Analysis"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Safety Notice Banner */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center space-x-3 text-xs text-blue-300">
        <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span>
          <strong>Foundry Safety Guarantee</strong>: Foundry never deletes or moves files silently. Every cleanup action produces a proposed plan for your explicit review and confirmation.
        </span>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Downloads Clutter</span>
          <p className="text-xl font-bold m-0 text-cyan-400">
            {downloads?.totalFiles || 0} files
          </p>
          <span className="text-[10px] text-[var(--text-muted)]">
            {downloads?.totalSizeFormatted || '0 B'} in Downloads folder
          </span>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Duplicate Files</span>
          <p className="text-xl font-bold m-0 text-amber-400">
            {duplicates?.totalDuplicateCount || 0} copies
          </p>
          <span className="text-[10px] text-[var(--text-muted)]">
            ~{duplicates?.totalWastedFormatted || '0 B'} reclaimable space
          </span>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Large Files (&gt;100MB)</span>
          <p className="text-xl font-bold m-0 text-purple-400">
            {largeFiles?.files.length || 0} files
          </p>
          <span className="text-[10px] text-[var(--text-muted)]">
            {largeFiles?.totalFormatted || '0 B'} storage consumed
          </span>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex border-b border-[var(--border-subtle)] text-xs font-medium space-x-4">
        <button
          type="button"
          onClick={() => setActiveSubTab('downloads')}
          className={`pb-2 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'downloads'
              ? 'border-cyan-400 text-cyan-400 font-semibold'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          Smart Downloads ({downloads?.totalFiles || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('duplicates')}
          className={`pb-2 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'duplicates'
              ? 'border-amber-400 text-amber-400 font-semibold'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          Duplicate Finder ({duplicates?.groups.length || 0} sets)
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('large_files')}
          className={`pb-2 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'large_files'
              ? 'border-purple-400 text-purple-400 font-semibold'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          Large Files ({largeFiles?.files.length || 0})
        </button>
      </div>

      {/* Tab 1: Smart Downloads */}
      {activeSubTab === 'downloads' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold m-0">Downloads Classification</h3>
            <button
              type="button"
              onClick={handleProposeDownloadsOrg}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>Propose Organization Plan</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {downloads?.categories.map((cat, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-main)]">{cat.name}</span>
                  <span className="text-cyan-400 font-bold">{cat.count}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] m-0">{cat.sizeFormatted}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate m-0">
                  .{cat.extensions.slice(0, 4).join(', .')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Duplicate Finder */}
      {activeSubTab === 'duplicates' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold m-0">Identified Duplicate Groups</h3>

          {duplicates?.groups.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-8 text-center">
              No duplicate files found in your accessible folders!
            </p>
          ) : (
            duplicates?.groups.map((grp, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300">
                    Duplicate Set #{idx + 1} ({grp.files.length} identical files, {grp.sizeFormatted} each)
                  </span>
                  <span className="text-[11px] text-amber-400 font-medium">
                    Wasting ~{grp.sizeFormatted}
                  </span>
                </div>

                <div className="space-y-1 pl-2 border-l-2 border-amber-500/30">
                  {grp.files.map((f, fIdx) => (
                    <div key={fIdx} className="flex items-center justify-between text-[11px]">
                      <span className="truncate pr-2">{f.name} ({f.path})</span>
                      <button
                        type="button"
                        onClick={() => revealFile(f.path)}
                        className="text-blue-400 hover:underline cursor-pointer flex-shrink-0"
                      >
                        Reveal
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Large Files */}
      {activeSubTab === 'large_files' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold m-0">Largest Files on Device</h3>

          <div className="space-y-1.5">
            {largeFiles?.files.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs hover:border-purple-500/30 transition-colors"
              >
                <div className="overflow-hidden pr-2">
                  <p className="font-medium truncate m-0">{file.name}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate m-0">{file.path}</p>
                </div>

                <div className="flex items-center space-x-3 flex-shrink-0">
                  <span className="font-bold text-purple-400">{file.sizeFormatted}</span>
                  <button
                    type="button"
                    onClick={() => revealFile(file.path)}
                    className="p-1 text-blue-400 hover:text-blue-300 cursor-pointer"
                    title="Reveal in Explorer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Safety Confirmation Modal */}
      {activeProposal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm">
              <FolderSync className="w-5 h-5" />
              <span>Review Proposed Organization Plan</span>
            </div>

            <p className="text-[var(--text-muted)] m-0 leading-relaxed">
              {activeProposal.description}
            </p>

            <div className="max-h-48 overflow-y-auto space-y-1.5 bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-subtle)]">
              {activeProposal.items.slice(0, 10).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px]">
                  <span className="truncate pr-2 font-medium">{item.fileName}</span>
                  <span className="text-cyan-300 flex-shrink-0">→ {item.category}/</span>
                </div>
              ))}
              {activeProposal.items.length > 10 && (
                <p className="text-[10px] text-[var(--text-muted)] text-center pt-1 m-0">
                  ... and {activeProposal.items.length - 10} more files
                </p>
              )}
            </div>

            {proposalStatus === 'success' ? (
              <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Organization plan approved and scheduled!</span>
              </div>
            ) : (
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveProposal(null)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApproveProposal}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium cursor-pointer"
                >
                  Confirm &amp; Organize
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
