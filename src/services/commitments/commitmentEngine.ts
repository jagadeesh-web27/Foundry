/**
 * Foundry CommitmentEngine - Central Coordinator for Commitment Intelligence
 * Coordinates message analysis, confidence assessment, temporal resolution,
 * persistent storage, and query fulfillment.
 */

import { Commitment, CommitmentOverview } from './types';
import { CommunicationItem } from './communicationItem';
import { messageAnalyzer } from './messageAnalyzer';
import { commitmentStore } from './commitmentStore';

export class CommitmentEngine {
  /**
   * Analyzes an incoming communication item and automatically extracts and persists valid commitments.
   */
  public async processCommunicationItem(item: CommunicationItem): Promise<Commitment[]> {
    const extracted = messageAnalyzer.analyzeCommunication(item);
    if (extracted.length === 0) return [];
    return commitmentStore.addBatch(extracted);
  }

  /**
   * Processes a batch of normalized communications.
   */
  public async processBatch(items: CommunicationItem[]): Promise<Commitment[]> {
    const allExtracted: Commitment[] = [];
    for (const item of items) {
      const extracted = messageAnalyzer.analyzeCommunication(item);
      allExtracted.push(...extracted);
    }
    if (allExtracted.length === 0) return [];
    return commitmentStore.addBatch(allExtracted);
  }

  /**
   * Directly analyzes plain text (e.g. from an ad-hoc note or user prompt) and creates tracked commitments.
   */
  public async analyzeTextAndTrack(
    text: string,
    options?: {
      sourceProvider?: string;
      senderName?: string;
      referenceDate?: Date;
    }
  ): Promise<Commitment[]> {
    const candidates = messageAnalyzer.analyzeText(text, {
      referenceDate: options?.referenceDate || new Date(),
      sender: options?.senderName ? { name: options.senderName } : undefined,
    });

    const now = new Date();
    const commitments: Commitment[] = candidates.map((cand, idx) => ({
      id: `com_manual_${Date.now()}_${idx}`,
      type: cand.type,
      title: cand.action,
      status: cand.type === 'WAITING_FOR' ? 'WAITING' : 'PENDING',
      dueAt: cand.dueAt,
      createdAt: now,
      updatedAt: now,
      source: {
        provider: options?.sourceProvider || 'LOCAL',
        senderName: options?.senderName,
        timestamp: now.toISOString(),
      },
      person: cand.person,
      confidence: cand.confidence,
      evidence: cand.evidence,
      isTentative: cand.isTentative,
    }));

    return commitmentStore.addBatch(commitments);
  }

  /**
   * Retrieves high-level categorized overview for UI and Agent reasoning.
   */
  public async getOverview(): Promise<CommitmentOverview> {
    return commitmentStore.getOverview();
  }

  /**
   * Retrieves commitments involving a specific person.
   */
  public async getCommitmentsForPerson(name: string): Promise<Commitment[]> {
    return commitmentStore.getCommitmentsForPerson(name);
  }

  /**
   * Mark a commitment as completed.
   */
  public async completeCommitment(id: string): Promise<void> {
    return commitmentStore.setStatus(id, 'COMPLETED');
  }

  /**
   * Dismiss a commitment.
   */
  public async dismissCommitment(id: string): Promise<void> {
    return commitmentStore.setStatus(id, 'DISMISSED');
  }

  /**
   * Confirm a tentative commitment, transitioning it into active tracking.
   */
  public async confirmTentativeCommitment(id: string): Promise<void> {
    const item = await commitmentStore.getCommitment(id);
    if (!item) return;
    item.isTentative = false;
    item.confidence = Math.max(0.85, item.confidence);
    item.updatedAt = new Date();
    await commitmentStore.addCommitment(item);
  }

  /**
   * Synthesizes answers to "What am I forgetting?" by combining overdue obligations,
   * impending deadlines, and unresolved promises.
   */
  public async getWhatAmIForgetting(): Promise<{
    overdue: Commitment[];
    upcomingDueToday: Commitment[];
    waitingFor: Commitment[];
    summary: string;
  }> {
    const overview = await this.getOverview();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

    const upcomingDueToday = overview.needToDo.filter(
      (c) => c.dueAt && c.dueAt.getTime() >= startOfToday.getTime() && c.dueAt.getTime() <= endOfToday.getTime()
    );

    const formatSource = (item: any) => {
      if (item.sources && item.sources.length > 1) {
        return `Sources: ${item.sources.map((s: any) => s.provider).join(', ')}`;
      }
      return `Source: ${item.source.provider}`;
    };

    const lines: string[] = [];
    if (overview.overdue.length > 0) {
      lines.push(`You have ${overview.overdue.length} overdue commitment${overview.overdue.length > 1 ? 's' : ''}:`);
      for (const item of overview.overdue) {
        lines.push(`- **${item.title}** (${item.person?.name ? `with ${item.person.name}` : ''}) [${formatSource(item)}]`);
      }
    }

    if (upcomingDueToday.length > 0) {
      lines.push(`\nDue today:`);
      for (const item of upcomingDueToday) {
        lines.push(`- **${item.title}** [${formatSource(item)}]`);
      }
    }

    if (overview.waitingFor.length > 0) {
      lines.push(`\nYou are waiting on ${overview.waitingFor.length} item${overview.waitingFor.length > 1 ? 's' : ''}:`);
      for (const item of overview.waitingFor.slice(0, 3)) {
        lines.push(`- ${item.title} (${item.person?.name || 'Someone'})`);
      }
    }

    const { connectorStatusManager } = await import('@/services/connectors/core/connectorStatus');
    const statuses = await connectorStatusManager.getAllStatuses();
    const commConnectors = statuses.filter((s) =>
      ['microsoft_outlook', 'microsoft_teams', 'google_gmail', 'slack_workspace'].includes(s.connectorId)
    );
    const connectedCount = commConnectors.filter((s) => s.connected).length;

    if (lines.length === 0) {
      lines.push("You are completely caught up on your tracked commitments!");
    }

    if (connectedCount === 0) {
      lines.push("\n*Provenance note: Microsoft Outlook and Teams are not currently connected. Your external mailbox and team chats were not analyzed.*");
    } else {
      const activeNames = commConnectors.filter((s) => s.connected).map((s) => s.displayName).join(', ');
      lines.push(`\n*Sources checked: ${activeNames}*`);
    }

    return {
      overdue: overview.overdue,
      upcomingDueToday,
      waitingFor: overview.waitingFor,
      summary: lines.join('\n'),
    };
  }
}

export const commitmentEngine = new CommitmentEngine();
