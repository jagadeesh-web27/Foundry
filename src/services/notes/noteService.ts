import { Note } from '@/types/note';
import { db } from '../db/database';
import { GraphNode, GraphEdge } from '@/types/graph';

export class NoteService {
  async getAll(): Promise<Note[]> {
    return db.getNotes();
  }

  async getById(id: string): Promise<Note | null> {
    return db.getNoteById(id);
  }

  async save(noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Note> {
    const now = new Date().toISOString();
    const id = noteData.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const existing = noteData.id ? await db.getNoteById(noteData.id) : null;

    const note: Note = {
      id,
      title: noteData.title.trim() || 'Untitled Note',
      content: noteData.content,
      tags: noteData.tags || [],
      linkedDocumentIds: noteData.linkedDocumentIds || [],
      linkedConceptIds: noteData.linkedConceptIds || [],
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await db.saveNote(note);

    // Save graph node
    const graphNode: GraphNode = {
      id: `note_${id}`,
      label: note.title,
      type: 'Note',
      entityId: id,
      val: 2.0,
      metadata: {
        tags: note.tags,
      },
    };
    await db.saveGraphNode(graphNode);

    // Create graph edges for linked documents
    for (const docId of note.linkedDocumentIds) {
      const edge: GraphEdge = {
        id: `edge_${id}_${docId}`,
        source: `note_${id}`,
        target: `doc_${docId}`,
        relationship: 'REFERENCES',
        reason: `Note "${note.title}" references this document`,
        createdAt: now,
      };
      await db.saveGraphEdge(edge);
    }

    return note;
  }

  async delete(id: string): Promise<void> {
    await db.deleteNote(id);
  }
}

export const noteService = new NoteService();
