/**
 * Foundry CommitmentStore - Persistent Storage & Deduplication Engine
 * Provides IndexedDB-backed persistence, cross-app deduplication, and categorized queries.
 */

import { Commitment, CommitmentStatus, CommitmentOverview } from './types';
import { db, StoredCommitment } from '@/services/db/database';

export class CommitmentStore {
  /**
   * Saves a commitment with cross-app deduplication.
   */
  public async addCommitment(commitment: Commitment): Promise<Commitment> {
    const existing = await this.listCommitments();
    const duplicate = this.findDuplicate(commitment, existing);

    if (duplicate) {
      // Merge: keep higher confidence, preserve and aggregate all source references
      const existingSources = duplicate.sources || [duplicate.source];
      const newSource = commitment.source;
      const mergedSources = [...existingSources];
      const alreadyHasSource = mergedSources.some(
        (s) => s.provider.toLowerCase() === newSource.provider.toLowerCase() &&
               (s.messageId === newSource.messageId || !s.messageId)
      );
      if (!alreadyHasSource) {
        mergedSources.push(newSource);
      }

      const updated: Commitment = {
        ...duplicate,
        sources: mergedSources,
        confidence: Math.max(duplicate.confidence, commitment.confidence),
        evidence: duplicate.evidence || commitment.evidence,
        updatedAt: new Date(),
      };
      await db.saveCommitment(this.toStored(updated));
      return updated;
    }

    const commitmentWithSources: Commitment = {
      ...commitment,
      sources: commitment.sources || [commitment.source],
    };
    await db.saveCommitment(this.toStored(commitmentWithSources));
    return commitmentWithSources;
  }

  /**
   * Adds a batch of commitments, deduplicating them against each other and against existing records.
   */
  public async addBatch(commitments: Commitment[]): Promise<Commitment[]> {
    const results: Commitment[] = [];
    for (const c of commitments) {
      const added = await this.addCommitment(c);
      results.push(added);
    }
    return results;
  }

  /**
   * Retrieves all commitments from persistent storage.
   */
  public async listCommitments(status?: CommitmentStatus): Promise<Commitment[]> {
    const stored = await db.getCommitments(status);
    return stored.map((s) => this.fromStored(s));
  }

  /**
   * Get a commitment by ID.
   */
  public async getCommitment(id: string): Promise<Commitment | null> {
    const stored = await db.getCommitment(id);
    return stored ? this.fromStored(stored) : null;
  }

  /**
   * Update commitment status (e.g. mark COMPLETED or DISMISSED).
   */
  public async setStatus(id: string, status: CommitmentStatus): Promise<void> {
    await db.updateCommitmentStatus(id, status);
  }

  /**
   * Delete a commitment.
   */
  public async deleteCommitment(id: string): Promise<void> {
    await db.deleteCommitment(id);
  }

  /**
   * Retrieve structured commitments categorized for the "Pending" view and "Today" dashboard.
   */
  public async getOverview(): Promise<CommitmentOverview> {
    const all = await this.listCommitments();
    const active = all.filter((c) => c.status !== 'COMPLETED' && c.status !== 'DISMISSED' && c.status !== 'CANCELLED');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

    const needToDo: Commitment[] = [];
    const waitingFor: Commitment[] = [];
    const peopleWaitingForMe: Commitment[] = [];
    const upcoming: Commitment[] = [];
    const overdue: Commitment[] = [];

    let tentativeCount = 0;

    for (const item of active) {
      if (item.isTentative) {
        tentativeCount++;
      }

      const isPastDue = item.dueAt && item.dueAt.getTime() < now.getTime();
      const isFuture = item.dueAt && item.dueAt.getTime() > endOfToday.getTime();

      if (isPastDue) {
        overdue.push(item);
      }

      // Categorize into the 4 primary buckets:
      if (item.type === 'WAITING_FOR' || item.status === 'WAITING') {
        waitingFor.push(item);
      } else if (item.type === 'REQUEST') {
        // Someone asked me for something -> People waiting for me
        peopleWaitingForMe.push(item);
      } else if (item.type === 'PROMISE' || item.type === 'DEADLINE' || item.type === 'TASK') {
        // I need to do
        needToDo.push(item);
      }

      if (isFuture || (!item.dueAt && item.type === 'FOLLOW_UP')) {
        upcoming.push(item);
      }
    }

    return {
      needToDo,
      waitingFor,
      peopleWaitingForMe,
      upcoming,
      overdue,
      tentativeCount,
    };
  }

  /**
   * Search commitments by target person name (e.g. "What did I promise Rahul?").
   */
  public async getCommitmentsForPerson(personName: string): Promise<Commitment[]> {
    const all = await this.listCommitments();
    const qLower = personName.toLowerCase().trim();
    return all.filter((c) => {
      const matchPerson = c.person?.name?.toLowerCase().includes(qLower);
      const matchTitle = c.title.toLowerCase().includes(qLower);
      const matchEvidence = c.evidence?.toLowerCase().includes(qLower);
      return matchPerson || matchTitle || matchEvidence;
    });
  }

  /**
   * Deduplication logic: Checks if two commitments refer to the same obligation.
   */
  private findDuplicate(target: Commitment, list: Commitment[]): Commitment | undefined {
    const targetNormAction = this.normalizeText(target.title);
    const targetPerson = (target.person?.name || '').toLowerCase().trim();
    const targetDay = target.dueAt ? this.toDayString(target.dueAt) : '';

    return list.find((item) => {
      if (item.id === target.id) return false;
      const itemNormAction = this.normalizeText(item.title);
      const itemPerson = (item.person?.name || '').toLowerCase().trim();
      const itemDay = item.dueAt ? this.toDayString(item.dueAt) : '';

      const actionsMatch = targetNormAction === itemNormAction ||
        targetNormAction.includes(itemNormAction) ||
        itemNormAction.includes(targetNormAction);

      const personsMatch = !targetPerson || !itemPerson || targetPerson === itemPerson;
      const datesMatch = !targetDay || !itemDay || targetDay === itemDay;

      return actionsMatch && personsMatch && datesMatch;
    });
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toDayString(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  private toStored(c: Commitment): StoredCommitment {
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      description: c.description,
      status: c.status,
      dueAt: c.dueAt ? c.dueAt.toISOString() : undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      source: c.source,
      sources: c.sources || [c.source],
      person: c.person,
      confidence: c.confidence,
      evidence: c.evidence,
      reminderState: c.reminderState
        ? {
            scheduledAt: c.reminderState.scheduledAt?.toISOString(),
            notified: c.reminderState.notified,
          }
        : undefined,
      isTentative: c.isTentative,
    };
  }

  private fromStored(s: StoredCommitment): Commitment {
    return {
      id: s.id,
      type: s.type,
      title: s.title,
      description: s.description,
      status: s.status,
      dueAt: s.dueAt ? new Date(s.dueAt) : undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
      source: s.source,
      sources: s.sources || [s.source],
      person: s.person,
      confidence: s.confidence,
      evidence: s.evidence,
      reminderState: s.reminderState
        ? {
            scheduledAt: s.reminderState.scheduledAt ? new Date(s.reminderState.scheduledAt) : undefined,
            notified: s.reminderState.notified,
          }
        : undefined,
      isTentative: s.isTentative,
    };
  }
}

export const commitmentStore = new CommitmentStore();
