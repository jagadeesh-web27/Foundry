/**
 * Foundry Memory Engine
 * Implements 5-tier persistent memory (ShortTerm, LongTerm, Preference, Project, Episodic)
 * with full user transparency, auditability, and selective context retrieval.
 */

import { db, MemoryItem, MemoryType } from '@/services/db/database';

export class MemoryEngine {
  /**
   * Save or update a memory item
   */
  async save(
    keyOrObj: string | { key: string; value?: string; content?: string; type?: MemoryType; tier?: MemoryType; tags?: string[]; confidence?: number },
    value?: string,
    type: MemoryType = 'long_term',
    tags: string[] = []
  ): Promise<MemoryItem> {
    let finalKey = '';
    let finalVal = '';
    let finalType = type;
    let finalTags = tags;

    if (typeof keyOrObj === 'object' && keyOrObj !== null) {
      finalKey = keyOrObj.key || '';
      finalVal = keyOrObj.content || keyOrObj.value || '';
      finalType = keyOrObj.tier || keyOrObj.type || 'long_term';
      finalTags = keyOrObj.tags || [];
    } else {
      finalKey = String(keyOrObj || '');
      finalVal = value || '';
    }

    const existing = await this.getAll(finalType);
    const matched = existing.find((m) => m.key.toLowerCase() === finalKey.toLowerCase());

    const item: MemoryItem = {
      id: matched?.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: finalType,
      key: finalKey.trim(),
      value: finalVal.trim(),
      tags: finalTags,
      createdAt: matched?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.upsertMemoryItem(item);
    return item;
  }

  /**
   * Recall memories matching a search query
   */
  async recall(query: string, type?: MemoryType): Promise<MemoryItem[]> {
    const items = await db.getMemoryItems(type);
    if (!query || !query.trim()) return items;

    const lowerQ = query.toLowerCase();
    const tokens = lowerQ
      .split(/[^a-zA-Z0-9]+/)
      .filter((w) => w.length > 2 && !['what', 'where', 'when', 'how', 'show', 'tell', 'the', 'and'].includes(w));

    return items.filter((item) => {
      const matchKey = item.key.toLowerCase().includes(lowerQ);
      const matchVal = item.value.toLowerCase().includes(lowerQ);
      const matchTags = (item.tags || []).some((t) => t.toLowerCase().includes(lowerQ));

      if (matchKey || matchVal || matchTags) return true;

      // Partial token overlap
      if (tokens.length > 0) {
        return tokens.some(
          (tok) => item.key.toLowerCase().includes(tok) || item.value.toLowerCase().includes(tok)
        );
      }

      return false;
    });
  }

  /**
   * Get all memory items of a given type
   */
  async getAll(type?: MemoryType): Promise<MemoryItem[]> {
    return db.getMemoryItems(type);
  }

  /**
   * Delete a specific memory item by ID
   */
  async delete(id: string): Promise<void> {
    await db.deleteMemoryItem(id);
  }

  /**
   * Clear all memories
   */
  async clearAll(): Promise<void> {
    await db.clearAllMemories();
  }

  /**
   * Format minimal relevant memories for LLM prompt context
   */
  async getRelevantContext(prompt: string): Promise<string> {
    const recalled = await this.recall(prompt);
    if (recalled.length === 0) return '';

    const top = recalled.slice(0, 5);
    const lines = ['USER PREFERENCES & RECALLED MEMORY:'];
    for (const item of top) {
      lines.push(`- [${item.type}] ${item.key}: ${item.value}`);
    }

    return lines.join('\n');
  }
}

export const memoryEngine = new MemoryEngine();
