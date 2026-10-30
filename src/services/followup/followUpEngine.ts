/**
 * Foundry Follow-Up Engine
 * Tracks commitments, deadlines, promises, and items waiting for other people or documents.
 * Solves the everyday problem: "I promised to do X" or "I'm waiting for Y to send Z".
 */

import { db, FollowUpItem, FollowUpType } from '@/services/db/database';

export interface CreateFollowUpArgs {
  title: string;
  type: FollowUpType;
  targetPerson?: string;
  dueDate?: string;
  notes?: string;
}

export interface AttentionItem {
  id: string;
  title: string;
  type: FollowUpType;
  reason: 'overdue' | 'due_today' | 'waiting_long' | 'urgent';
  targetPerson?: string;
  dueDate?: string;
}

export class FollowUpEngine {
  /**
   * Create and persist a new follow-up item
   */
  async createFollowUp(args: CreateFollowUpArgs): Promise<FollowUpItem> {
    const item: FollowUpItem = {
      id: `flw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: args.title.trim(),
      type: args.type,
      targetPerson: args.targetPerson?.trim(),
      dueDate: args.dueDate,
      notes: args.notes?.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.upsertFollowUp(item);
    return item;
  }

  /**
   * Retrieve follow-up items optionally filtered by status
   */
  async listFollowUps(status?: 'pending' | 'resolved' | 'all'): Promise<FollowUpItem[]> {
    return db.getFollowUps(status || 'pending');
  }

  /**
   * Mark a follow-up item as resolved
   */
  async resolveFollowUp(id: string): Promise<boolean> {
    const all = await db.getFollowUps('all');
    const item = all.find((f) => f.id === id);
    if (!item) return false;

    item.status = 'resolved';
    item.updatedAt = new Date().toISOString();
    await db.upsertFollowUp(item);
    return true;
  }

  /**
   * Delete a follow-up item
   */
  async deleteFollowUp(id: string): Promise<boolean> {
    await db.deleteFollowUp(id);
    return true;
  }

  /**
   * Retrieve follow-up items needing immediate user attention today
   */
  async getAttentionItems(): Promise<AttentionItem[]> {
    const pending = await db.getFollowUps('pending');
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const twoDaysAgo = now.getTime() - 2 * 24 * 60 * 60 * 1000;

    const items: AttentionItem[] = [];

    for (const item of pending) {
      if (item.dueDate) {
        const due = new Date(item.dueDate).getTime();
        const dueDateStr = item.dueDate.slice(0, 10);
        if (dueDateStr === todayStr) {
          items.push({
            id: item.id,
            title: item.title,
            type: item.type,
            reason: 'due_today',
            targetPerson: item.targetPerson,
            dueDate: item.dueDate,
          });
        } else if (due < now.getTime()) {
          items.push({
            id: item.id,
            title: item.title,
            type: item.type,
            reason: 'overdue',
            targetPerson: item.targetPerson,
            dueDate: item.dueDate,
          });
        }
      } else if (item.type === 'waiting_for' || item.type === 'pending_approval') {
        const created = new Date(item.createdAt).getTime();
        if (created < twoDaysAgo) {
          items.push({
            id: item.id,
            title: item.title,
            type: item.type,
            reason: 'waiting_long',
            targetPerson: item.targetPerson,
          });
        }
      }
    }

    return items;
  }

  /**
   * Heuristic scanner for conversational promises and waiting statements.
   * Enables proactive suggestions in chat without rigid commands.
   */
  detectPotentialFollowUp(text: string): { detected: boolean; suggestion?: CreateFollowUpArgs } {
    // "waiting for <person> to <action>"
    const waitingMatch = text.match(/waiting for\s+([a-zA-Z0-9\s]+?)\s+(?:to|for)\s+(.+)/i);
    if (waitingMatch) {
      return {
        detected: true,
        suggestion: {
          title: `Waiting for ${waitingMatch[1].trim()}: ${waitingMatch[2].trim()}`,
          type: 'waiting_for',
          targetPerson: waitingMatch[1].trim(),
        },
      };
    }

    // "need to send <thing> to <person> tomorrow"
    const sendMatch = text.match(/(?:need to|have to|must|should)\s+(?:send|email|submit|share)\s+(.+?)\s+(?:to|with)\s+([a-zA-Z0-9\s]+?)(?:\s+by|\s+tomorrow|\s+on|\.|$)/i);
    if (sendMatch) {
      return {
        detected: true,
        suggestion: {
          title: `Send ${sendMatch[1].trim()} to ${sendMatch[2].trim()}`,
          type: 'task',
          targetPerson: sendMatch[2].trim(),
        },
      };
    }

    // "promised <person> to <action>"
    const promisedMatch = text.match(/promised\s+([a-zA-Z0-9\s]+?)\s+(?:to|that)\s+(.+)/i);
    if (promisedMatch) {
      return {
        detected: true,
        suggestion: {
          title: `Promised ${promisedMatch[1].trim()}: ${promisedMatch[2].trim()}`,
          type: 'promise',
          targetPerson: promisedMatch[1].trim(),
        },
      };
    }

    return { detected: false };
  }
}

export const followUpEngine = new FollowUpEngine();
