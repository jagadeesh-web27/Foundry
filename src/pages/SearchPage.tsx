import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Sparkles } from 'lucide-react';
import { SearchResult, SearchMode } from '@/types/search';
import { searchService } from '@/services/search/searchService';
import { EmptyState } from '@/components/common/EmptyState';
import { SupportedFileType } from '@/types/document';
import { useApp } from '@/stores/AppContext';

export const SearchPage: React.FC = () => {
  const { aiService } = useApp();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [selectedFileType, setSelectedFileType] = useState<SupportedFileType | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      let queryEmbedding: number[] | undefined = undefined;
      if (mode === 'semantic' || mode === 'hybrid') {
        try {
          // Attempt local embedding if provider is available
          queryEmbedding = await aiService.getProvider().embed(query);
        } catch {
          // Fall back gracefully to keyword matching if embedding provider is offline
        }
      }

      const res = await searchService.search(
        query,
        mode,
        {
          fileTypes: selectedFileType !== 'all' ? [selectedFileType] : undefined,
        },
        queryEmbedding
      );
      setResults(res);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [query, mode, selectedFileType, aiService]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        void handleSearch();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <h2 className="text-xl font-bold text-[var(--text-main)] m-0">Unified Knowledge Search</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Perform keyword, local semantic, or hybrid search across all your indexed notes and documents.
        </p>
      </div>

      {/* Search Input Box */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-[var(--text-faint)]" />
          <input
            type="text"
            placeholder="Search ideas, topics, focus order in forms, notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 text-sm rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none shadow-xs"
            aria-label="Search query"
            autoFocus
          />
        </div>

        {/* Mode Selector & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Search Mode */}
          <div className="flex items-center space-x-1 p-1 rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setMode('hybrid')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                mode === 'hybrid'
                  ? 'bg-blue-600 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              Hybrid (Keyword + Semantic)
            </button>
            <button
              type="button"
              onClick={() => setMode('keyword')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                mode === 'keyword'
                  ? 'bg-blue-600 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              Exact Keyword
            </button>
            <button
              type="button"
              onClick={() => setMode('semantic')}
              className={`px-3 py-1 rounded font-medium transition-colors flex items-center space-x-1 ${
                mode === 'semantic'
                  ? 'bg-blue-600 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Semantic Only</span>
            </button>
          </div>

          {/* File Type filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-[var(--text-faint)]" />
            <select
              value={selectedFileType}
              onChange={(e) => setSelectedFileType(e.target.value as SupportedFileType | 'all')}
              className="px-2.5 py-1 text-xs rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              aria-label="Filter file type"
            >
              <option value="all">All File Types</option>
              <option value="pdf">PDF</option>
              <option value="markdown">Markdown</option>
              <option value="txt">TXT</option>
              <option value="docx">DOCX</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div>
        {loading ? (
          <div className="py-12 text-center text-xs text-[var(--text-faint)]">
            Searching local knowledge index...
          </div>
        ) : hasSearched && results.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching knowledge found"
            description={`No indexed documents or notes matched "${query}". Try different search terms or verify your files are imported.`}
          />
        ) : results.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs text-[var(--text-faint)]">
              Found {results.length} relevant {results.length === 1 ? 'match' : 'matches'}
            </div>
            {results.map((result) => (
              <div
                key={result.id}
                className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--text-faint)] transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {result.type === 'Document' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-600/10 text-blue-500 border border-blue-600/20">
                        {result.fileType || 'Document'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-600/10 text-indigo-500 border border-indigo-600/20">
                        Note
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">{result.title}</h3>
                    {result.pageNumber && (
                      <span className="text-[11px] text-[var(--text-faint)]">Page {result.pageNumber}</span>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-[var(--text-faint)]">
                    Score: {result.score.toFixed(2)}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{result.snippet}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
