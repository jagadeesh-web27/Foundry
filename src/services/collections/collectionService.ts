import { Collection, Bookmark } from '@/types/collection';
import { db } from '../db/database';
import { GraphNode } from '@/types/graph';

export class CollectionService {
  async getAll(): Promise<Collection[]> {
    return db.getCollections();
  }

  async save(colData: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Collection> {
    const now = new Date().toISOString();
    const id = colData.id || `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const existing = colData.id ? (await db.getCollections()).find((c) => c.id === colData.id) : null;

    const collection: Collection = {
      id,
      name: colData.name.trim() || 'Untitled Collection',
      description: colData.description || '',
      color: colData.color || '#3b82f6',
      documentIds: colData.documentIds || [],
      noteIds: colData.noteIds || [],
      bookmarkIds: colData.bookmarkIds || [],
      conceptIds: colData.conceptIds || [],
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await db.saveCollection(collection);

    // Save Graph Node
    const graphNode: GraphNode = {
      id: `col_${id}`,
      label: collection.name,
      type: 'Collection',
      entityId: id,
      val: 2.5,
      metadata: {
        color: collection.color,
      },
    };
    await db.saveGraphNode(graphNode);

    return collection;
  }

  async delete(id: string): Promise<void> {
    await db.deleteCollection(id);
    await db.deleteGraphNode(`col_${id}`);
  }

  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
    return db.getBookmarks();
  }

  async saveBookmark(bmData: Omit<Bookmark, 'id' | 'createdAt'> & { id?: string }): Promise<Bookmark> {
    const now = new Date().toISOString();
    const id = bmData.id || `bm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const bookmark: Bookmark = {
      id,
      url: bmData.url,
      title: bmData.title.trim() || bmData.url,
      description: bmData.description,
      tags: bmData.tags || [],
      createdAt: now,
      collectionId: bmData.collectionId,
    };

    await db.saveBookmark(bookmark);
    return bookmark;
  }

  async deleteBookmark(id: string): Promise<void> {
    await db.deleteBookmark(id);
  }
}

export const collectionService = new CollectionService();
