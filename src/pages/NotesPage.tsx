import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Tag,
  BookOpen,
  Search,
  Check,
} from 'lucide-react';
import { Note } from '@/types/note';
import { Document } from '@/types/document';
import { noteService } from '@/services/notes/noteService';
import { db } from '@/services/db/database';
import { useApp } from '@/stores/AppContext';
import { Button } from '@/components/ui/Button';

export const NotesPage: React.FC = () => {
  const { refreshStats } = useApp();
  const [notes, setNotes] = useState<Note[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Editor form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  const selectNoteForEdit = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
    setTagsInput(note.tags.join(', '));
    setSelectedDocIds(note.linkedDocumentIds || []);
    setIsSaved(false);
  };

  const loadData = async () => {
    setLoading(true);
    const [allNotes, allDocs] = await Promise.all([
      noteService.getAll(),
      db.getDocuments(),
    ]);
    setNotes(allNotes);
    setDocuments(allDocs);
    if (allNotes.length > 0 && !selectedNote) {
      selectNoteForEdit(allNotes[0]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      noteService.getAll(),
      db.getDocuments(),
    ]).then(([allNotes, allDocs]) => {
      if (!cancelled) {
        setNotes(allNotes);
        setDocuments(allDocs);
        if (allNotes.length > 0) {
          selectNoteForEdit(allNotes[0]);
        }
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

  const handleNewNote = () => {
    setSelectedNote(null);
    setTitle('');
    setContent('');
    setTagsInput('');
    setSelectedDocIds([]);
    setIsSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const saved = await noteService.save({
      id: selectedNote?.id,
      title: title.trim() || 'Untitled Note',
      content,
      tags,
      linkedDocumentIds: selectedDocIds,
      linkedConceptIds: [],
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);

    await loadData();
    setSelectedNote(saved);
    await refreshStats();
  };

  const handleDelete = async (id: string) => {
    await noteService.delete(id);
    if (selectedNote?.id === id) {
      handleNewNote();
    }
    await loadData();
    await refreshStats();
  };

  const toggleDocLink = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const filteredNotes = notes.filter((n) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-[calc(100vh-56px-28px)] overflow-hidden">
      {/* Left Column: Notes List */}
      <div className="w-80 border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col h-full">
        {/* Top bar */}
        <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-main)] m-0">Notes</h2>
          <Button variant="primary" size="sm" icon={Plus} onClick={handleNewNote}>
            New
          </Button>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--text-faint)]" />
            <input
              type="text"
              placeholder="Search notes & tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 text-xs rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              aria-label="Filter notes"
            />
          </div>
        </div>
wha tis 
        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
          {loading ? (
            <div className="p-4 text-center text-xs text-[var(--text-faint)]">Loading notes...</div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--text-faint)]">
              No notes found. Create one to begin capturing insights.
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNoteForEdit(note)}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedNote?.id === note.id
                    ? 'bg-[var(--bg-tertiary)] border-l-2 border-blue-500'
                    : 'hover:bg-[var(--bg-tertiary)]/50'
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') selectNoteForEdit(note);
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-[var(--text-main)] truncate m-0">
                    {note.title}
                  </h4>
                  <span className="text-[10px] text-[var(--text-faint)] flex-shrink-0">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed mb-1.5">
                  {note.content || 'Empty note...'}
                </p>
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-blue-600/10 text-blue-400"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Note Editor */}
      <div className="flex-1 flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto">
        <form onSubmit={handleSave} className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full space-y-4">
          {/* Action Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-faint)]">
              {selectedNote ? `Editing note · Last updated ${new Date(selectedNote.updatedAt).toLocaleDateString()}` : 'Creating new note'}
            </span>

            <div className="flex items-center space-x-2">
              {selectedNote && (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedNote.id)}
                  className="p-1.5 rounded text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  title="Delete note"
                  aria-label="Delete note"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="sm"
                icon={isSaved ? Check : Save}
              >
                {isSaved ? 'Saved' : 'Save Note'}
              </Button>
            </div>
          </div>

          {/* Title Input */}
          <div>
            <input
              type="text"
              placeholder="Note Title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-lg font-bold bg-transparent border-b border-[var(--border-subtle)] pb-2 text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-blue-500"
              aria-label="Note title"
            />
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            <textarea
              placeholder="Write markdown or plain text notes, insights, observations..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full flex-1 p-3 text-xs leading-relaxed bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none resize-none font-mono"
              aria-label="Note content"
            />
          </div>

          {/* Metadata: Tags and Linked Documents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-subtle)]">
            {/* Tags */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-main)] flex items-center space-x-1">
                <Tag className="w-3.5 h-3.5 text-blue-500" />
                <span>Tags (comma-separated)</span>
              </label>
              <input
                type="text"
                placeholder="accessibility, wcag, focus, forms"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none"
              />
            </div>

            {/* Linked Documents (Creates real graph relationships!) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-main)] flex items-center space-x-1">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                <span>Link to Indexed Documents</span>
              </label>
              {documents.length === 0 ? (
                <p className="text-[11px] text-[var(--text-faint)] italic">
                  No documents imported yet to link.
                </p>
              ) : (
                <div className="max-h-24 overflow-y-auto space-y-1 p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                  {documents.map((doc) => {
                    const isLinked = selectedDocIds.includes(doc.id);
                    return (
                      <label
                        key={doc.id}
                        className="flex items-center space-x-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={() => toggleDocLink(doc.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{doc.title}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
