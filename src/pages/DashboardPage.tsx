import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  BookOpen,
  Network,
  Cpu,
  HardDrive,
  Upload,
  Plus,
  ArrowRight,
  Clock,
  Search,
} from 'lucide-react';
import { useApp } from '@/stores/AppContext';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { Document } from '@/types/document';
import { db } from '@/services/db/database';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { stats, aiStatus, refreshStats } = useApp();
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecent = async () => {
      setLoading(true);
      await refreshStats();
      const docs = await db.getDocuments();
      // Sort newest imported first
      const sorted = [...docs].sort(
        (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
      );
      setRecentDocs(sorted.slice(0, 5));
      setLoading(false);
    };
    loadRecent();
  }, [refreshStats]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] m-0">Your Knowledge System</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Private, local-first intelligence running directly on this device.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => navigate('/notes')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] transition-colors border border-[var(--border-subtle)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/imports')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Documents</span>
          </button>
        </div>
      </div>

      {/* Real Statistics Grid (NO fake data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Documents"
          value={stats.totalDocuments}
          description={`${stats.totalChunks} indexed chunks`}
          icon={BookOpen}
          accentColor="text-blue-500"
        />
        <StatCard
          label="Notes"
          value={stats.totalNotes}
          description="Personal insights & tags"
          icon={FileText}
          accentColor="text-indigo-500"
        />
        <StatCard
          label="Graph Concepts"
          value={stats.totalConcepts}
          description="Extracted entities & topics"
          icon={Network}
          accentColor="text-emerald-500"
        />
        <StatCard
          label="Connections"
          value={stats.totalRelationships}
          description="Multi-signal relationships"
          icon={Network}
          accentColor="text-amber-500"
        />
      </div>

      {/* Engine & Provider Status Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Local Vector Index Status */}
        <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">Vector Index Engine</h3>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {stats.totalChunks > 0
                ? `${stats.totalChunks} chunks active and indexed for local semantic search.`
                : 'Index is ready. Import documents to begin vector generation.'}
            </p>
            <div className="text-[11px] text-[var(--text-faint)] pt-1 flex items-center space-x-2">
              <HardDrive className="w-3 h-3" />
              <span>Storage Used: {formatBytes(stats.storageUsageBytes)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="text-xs text-blue-500 hover:text-blue-400 flex items-center space-x-1"
          >
            <span>Search</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* AI Provider Status */}
        <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  aiStatus.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">
                {aiStatus.isAvailable ? 'Local AI Connected' : 'AI Provider Not Available'}
              </h3>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {aiStatus.isAvailable
                ? `Active: ${aiStatus.providerType} (${aiStatus.modelName}) · ${aiStatus.latencyMs ?? 0}ms response time`
                : 'Ollama or LM Studio is not detected at current endpoint.'}
            </p>
            <div className="text-[11px] text-[var(--text-faint)] pt-1 flex items-center space-x-2">
              <Cpu className="w-3 h-3" />
              <span>Endpoint: {aiStatus.endpoint}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="text-xs text-blue-500 hover:text-blue-400 flex items-center space-x-1"
          >
            <span>Configure</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Recent Activity Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Imports */}
        <div className="lg:col-span-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">Recent Documents</h3>
            {stats.totalDocuments > 0 && (
              <button
                type="button"
                onClick={() => navigate('/knowledge')}
                className="text-xs text-blue-500 hover:underline flex items-center space-x-1"
              >
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-[var(--text-faint)]">Loading documents...</div>
          ) : recentDocs.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No documents imported yet"
              description="Bring in PDF, TXT, Markdown, or DOCX files to build your private knowledge base."
              actionLabel="Import First Document"
              onAction={() => navigate('/imports')}
            />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="py-2.5 flex items-center justify-between hover:bg-[var(--bg-tertiary)]/50 px-2 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-600/10 text-blue-500 border border-blue-600/20">
                      {doc.fileType}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-main)] truncate">{doc.title}</p>
                      <p className="text-[11px] text-[var(--text-faint)]">
                        {doc.wordCount.toLocaleString()} words · {doc.chunkCount} chunks
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] text-[var(--text-faint)] flex items-center space-x-1 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(doc.importedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Search & Explore helper */}
        <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-main)] mb-2">Explore Knowledge</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Query your indexed notes and documents semantically or view the interactive knowledge graph.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => navigate('/search')}
                className="w-full py-2 px-3 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-xs text-left font-medium text-[var(--text-main)] flex items-center justify-between transition-colors border border-[var(--border-subtle)]"
              >
                <div className="flex items-center space-x-2">
                  <Search className="w-3.5 h-3.5 text-blue-500" />
                  <span>Semantic & Keyword Search</span>
                </div>
                <ArrowRight className="w-3 h-3 text-[var(--text-faint)]" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/graph')}
                className="w-full py-2 px-3 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-xs text-left font-medium text-[var(--text-main)] flex items-center justify-between transition-colors border border-[var(--border-subtle)]"
              >
                <div className="flex items-center space-x-2">
                  <Network className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Knowledge Graph View</span>
                </div>
                <ArrowRight className="w-3 h-3 text-[var(--text-faint)]" />
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-faint)]">
            Foundry v0.1.0 · Local-First Architecture
          </div>
        </div>
      </div>
    </div>
  );
};
