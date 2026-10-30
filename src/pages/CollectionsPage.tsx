import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  Bookmark as BookmarkIcon,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Collection, Bookmark } from '@/types/collection';
import { collectionService } from '@/services/collections/collectionService';
import { useApp } from '@/stores/AppContext';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export const CollectionsPage: React.FC = () => {
  const { refreshStats } = useApp();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isColModalOpen, setIsColModalOpen] = useState(false);
  const [colName, setColName] = useState('');
  const [colDesc, setColDesc] = useState('');
  const [colColor, setColColor] = useState('#3b82f6');

  const [isBmModalOpen, setIsBmModalOpen] = useState(false);
  const [bmTitle, setBmTitle] = useState('');
  const [bmUrl, setBmUrl] = useState('');
  const [bmDesc, setBmDesc] = useState('');
  const [bmTags, setBmTags] = useState('');
  const [bmCollectionId, setBmCollectionId] = useState('');

  const loadData = async () => {
    const [cols, bms] = await Promise.all([
      collectionService.getAll(),
      collectionService.getBookmarks(),
    ]);
    setCollections(cols);
    setBookmarks(bms);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      collectionService.getAll(),
      collectionService.getBookmarks(),
    ]).then(([cols, bms]) => {
      if (!cancelled) {
        setCollections(cols);
        setBookmarks(bms);
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

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colName.trim()) return;

    await collectionService.save({
      name: colName,
      description: colDesc,
      color: colColor,
      documentIds: [],
      noteIds: [],
      bookmarkIds: [],
      conceptIds: [],
    });

    setColName('');
    setColDesc('');
    setIsColModalOpen(false);
    await loadData();
    await refreshStats();
  };

  const handleCreateBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bmUrl.trim()) return;

    const tags = bmTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    await collectionService.saveBookmark({
      url: bmUrl,
      title: bmTitle.trim() || bmUrl,
      description: bmDesc,
      tags,
      collectionId: bmCollectionId || undefined,
    });

    setBmTitle('');
    setBmUrl('');
    setBmDesc('');
    setBmTags('');
    setIsBmModalOpen(false);
    await loadData();
    await refreshStats();
  };

  const handleDeleteCollection = async (id: string) => {
    await collectionService.delete(id);
    await loadData();
    await refreshStats();
  };

  const handleDeleteBookmark = async (id: string) => {
    await collectionService.deleteBookmark(id);
    await loadData();
    await refreshStats();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Collections Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-main)] m-0">Collections</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Organize related documents, notes, concepts, and bookmarks into curated groups.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsColModalOpen(true)}
          >
            New Collection
          </Button>
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs text-[var(--text-faint)]">Loading collections...</div>
        ) : collections.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No collections created yet"
            description="Create collections like 'Accessibility', 'Research', or 'Projects' to group your knowledge."
            actionLabel="Create First Collection"
            onAction={() => setIsColModalOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((col) => (
              <div
                key={col.id}
                className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col justify-between hover:border-[var(--text-faint)] transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: col.color || '#3b82f6' }}
                      />
                      <h3 className="text-sm font-semibold text-[var(--text-main)] m-0">{col.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCollection(col.id)}
                      className="text-[var(--text-faint)] hover:text-rose-500 p-1"
                      title="Delete collection"
                      aria-label={`Delete ${col.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {col.description && (
                    <p className="text-xs text-[var(--text-muted)] mb-3">{col.description}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-faint)] flex items-center justify-between">
                  <span>
                    {col.documentIds.length} docs · {col.noteIds.length} notes
                  </span>
                  <span>{new Date(col.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bookmarks Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-base font-bold text-[var(--text-main)] m-0">Bookmarks & Web References</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Saved reference URLs and resources stored strictly locally.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() => setIsBmModalOpen(true)}
          >
            Add Bookmark
          </Button>
        </div>

        {bookmarks.length === 0 ? (
          <EmptyState
            icon={BookmarkIcon}
            title="No bookmarks stored yet"
            description="Save local links and web references to connect with your documents and notes."
            actionLabel="Add First Bookmark"
            onAction={() => setIsBmModalOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-start justify-between space-x-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center space-x-2">
                    <BookmarkIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <h4 className="text-xs font-semibold text-[var(--text-main)] truncate m-0">
                      {bm.title}
                    </h4>
                  </div>
                  <a
                    href={bm.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:underline flex items-center space-x-1 truncate font-mono"
                  >
                    <span className="truncate">{bm.url}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  {bm.description && (
                    <p className="text-xs text-[var(--text-muted)]">{bm.description}</p>
                  )}
                  {bm.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {bm.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-faint)]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteBookmark(bm.id)}
                  className="text-[var(--text-faint)] hover:text-rose-500 p-1 flex-shrink-0"
                  title="Delete bookmark"
                  aria-label={`Delete ${bm.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Collection Modal */}
      <Modal
        isOpen={isColModalOpen}
        onClose={() => setIsColModalOpen(false)}
        title="Create New Collection"
      >
        <form onSubmit={handleCreateCollection} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Collection Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Accessibility Standards"
              value={colName}
              onChange={(e) => setColName(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="What does this collection cover?"
              value={colDesc}
              onChange={(e) => setColDesc(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Accent Color</label>
            <div className="flex items-center space-x-2">
              {['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    colColor === c ? 'scale-110 border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsColModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Create Collection
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Bookmark Modal */}
      <Modal
        isOpen={isBmModalOpen}
        onClose={() => setIsBmModalOpen(false)}
        title="Add Local Bookmark"
      >
        <form onSubmit={handleCreateBookmark} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">URL</label>
            <input
              type="url"
              required
              placeholder="https://www.w3.org/WAI/WCAG22/quickref/"
              value={bmUrl}
              onChange={(e) => setBmUrl(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Title (Optional)</label>
            <input
              type="text"
              placeholder="e.g. WCAG 2.2 Quick Reference"
              value={bmTitle}
              onChange={(e) => setBmTitle(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Tags (comma separated)</label>
            <input
              type="text"
              placeholder="accessibility, wcag, standards"
              value={bmTags}
              onChange={(e) => setBmTags(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--text-main)] mb-1">Assign to Collection</label>
            <select
              value={bmCollectionId}
              onChange={(e) => setBmCollectionId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
            >
              <option value="">None</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsBmModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Bookmark
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
