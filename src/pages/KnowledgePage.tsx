import React, { useEffect, useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Trash2,
  Layers,
  ChevronRight,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Document, Chunk, SupportedFileType } from '@/types/document';
import { db } from '@/services/db/database';
import { useApp } from '@/stores/AppContext';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export const KnowledgePage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshStats } = useApp();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileType, setSelectedFileType] = useState<SupportedFileType | 'all'>('all');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<Document | null>(null);

  const loadDocuments = async () => {
    const docs = await db.getDocuments();
    setDocuments(docs);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    db.getDocuments().then((docs) => {
      if (!cancelled) {
        setDocuments(docs);
        setLoading(false);
      }
    }).catch((err) => {
      console.error(err);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectDoc = async (doc: Document) => {
    setSelectedDoc(doc);
    setLoadingChunks(true);
    const c = await db.getChunksByDocumentId(doc.id);
    setChunks(c);
    setLoadingChunks(false);
  };

  const handleDelete = async (doc: Document) => {
    await db.deleteDocument(doc.id);
    if (selectedDoc?.id === doc.id) {
      setSelectedDoc(null);
    }
    setDeleteConfirmDoc(null);
    await loadDocuments();
    await refreshStats();
  };

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        !searchQuery ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.fileName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedFileType === 'all' || doc.fileType === selectedFileType;
      return matchesSearch && matchesType;
    });
  }, [documents, searchQuery, selectedFileType]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] m-0">Knowledge Base</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Browse and inspect all indexed documents and chunks.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Upload}
          onClick={() => navigate('/imports')}
        >
          Import Files
        </Button>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-faint)]" />
          <input
            type="text"
            placeholder="Filter documents by title or file name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none"
            aria-label="Filter documents"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-3.5 h-3.5 text-[var(--text-faint)]" />
          <select
            value={selectedFileType}
            onChange={(e) => setSelectedFileType(e.target.value as SupportedFileType | 'all')}
            className="px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            aria-label="Filter by file type"
          >
            <option value="all">All File Types</option>
            <option value="pdf">PDF (.pdf)</option>
            <option value="markdown">Markdown (.md)</option>
            <option value="txt">Text (.txt)</option>
            <option value="docx">Word (.docx)</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Document List + Inspector Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document list */}
        <div className={`${selectedDoc ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all`}>
          {loading ? (
            <div className="py-12 text-center text-xs text-[var(--text-faint)]">Loading knowledge base...</div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No matching documents"
              description={
                documents.length === 0
                  ? 'Your knowledge base is currently empty. Import documents to get started.'
                  : 'No documents match your current filter query.'
              }
              actionLabel={documents.length === 0 ? 'Import First Document' : undefined}
              onAction={documents.length === 0 ? () => navigate('/imports') : undefined}
            />
          ) : (
            <div className="space-y-2">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleSelectDoc(doc)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                    selectedDoc?.id === doc.id
                      ? 'bg-[var(--bg-tertiary)] border-blue-500 shadow-xs'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--text-faint)]'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleSelectDoc(doc);
                    }
                  }}
                  aria-label={`Inspect ${doc.title}`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-600/10 text-blue-500 border border-blue-600/20">
                      {doc.fileType}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-[var(--text-main)] truncate m-0">
                        {doc.title}
                      </h4>
                      <p className="text-[11px] text-[var(--text-faint)] truncate mt-0.5">
                        {formatBytes(doc.fileSize)} · {doc.wordCount.toLocaleString()} words ·{' '}
                        {doc.chunkCount} chunks · {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmDoc(doc);
                      }}
                      className="p-1 rounded text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Delete document"
                      aria-label={`Delete ${doc.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document Inspector Drawer */}
        {selectedDoc && (
          <div className="lg:col-span-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 flex flex-col h-[calc(100vh-230px)] sticky top-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-semibold text-[var(--text-main)] truncate m-0">
                Document Details
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="text-xs text-[var(--text-faint)] hover:text-[var(--text-main)]"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Title</span>
                <p className="text-xs font-medium text-[var(--text-main)] break-words">{selectedDoc.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-[var(--bg-tertiary)]/50">
                  <span className="text-[10px] text-[var(--text-faint)] block">File Size</span>
                  <span className="font-semibold text-[var(--text-main)]">{formatBytes(selectedDoc.fileSize)}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-tertiary)]/50">
                  <span className="text-[10px] text-[var(--text-faint)] block">Words</span>
                  <span className="font-semibold text-[var(--text-main)]">{selectedDoc.wordCount.toLocaleString()}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-tertiary)]/50">
                  <span className="text-[10px] text-[var(--text-faint)] block">Pages</span>
                  <span className="font-semibold text-[var(--text-main)]">{selectedDoc.pageCount}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-tertiary)]/50">
                  <span className="text-[10px] text-[var(--text-faint)] block">Chunks</span>
                  <span className="font-semibold text-[var(--text-main)]">{selectedDoc.chunkCount}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">File Path</span>
                <p className="text-[11px] text-[var(--text-muted)] font-mono break-all">{selectedDoc.filePath}</p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Content SHA-256</span>
                <p className="text-[10px] text-[var(--text-faint)] font-mono break-all">{selectedDoc.hash}</p>
              </div>

              {/* Chunks preview */}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--text-main)] flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    <span>Indexed Chunks ({chunks.length})</span>
                  </span>
                </div>

                {loadingChunks ? (
                  <div className="py-4 text-center text-xs text-[var(--text-faint)]">Loading chunks...</div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className="p-2.5 rounded bg-[var(--bg-tertiary)]/60 text-xs border border-[var(--border-subtle)] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] text-[var(--text-faint)]">
                          <span>Chunk #{chunk.chunkIndex + 1}</span>
                          <span>Page {chunk.pageNumber ?? 1} · {chunk.tokenCount} tokens</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-3">
                          {chunk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmDoc}
        onClose={() => setDeleteConfirmDoc(null)}
        title="Delete Document"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Are you sure you want to delete <strong className="text-[var(--text-main)]">{deleteConfirmDoc?.title}</strong>?
            This will permanently remove the document, its {deleteConfirmDoc?.chunkCount} indexed chunks, and any associated graph relationships from your local device.
          </p>
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteConfirmDoc(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteConfirmDoc && handleDelete(deleteConfirmDoc)}
            >
              Delete Permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
