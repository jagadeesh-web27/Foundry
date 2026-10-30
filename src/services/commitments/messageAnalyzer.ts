/**
 * Foundry MessageAnalyzer - Linguistic Intent & Commitment Extraction
 * Analyzes normalized communication text, identifies actionable commitments, resolves participants,
 * and associates verified temporal targets.
 */

import { Commitment, CommitmentType, Person } from './types';
import { CommunicationItem } from './communicationItem';
import { dateResolver } from './dateResolver';
import { confidenceEngine } from './confidenceEngine';

export interface ExtractedCommitmentCandidate {
  type: CommitmentType;
  action: string;
  dueAt?: Date;
  person?: Person;
  evidence: string;
  confidence: number;
  isTentative: boolean;
}

export class MessageAnalyzer {
  /**
   * Analyzes a CommunicationItem and returns all verified commitment candidates.
   */
  public analyzeCommunication(item: CommunicationItem): Commitment[] {
    const candidates = this.analyzeText(item.content, {
      referenceDate: item.timestamp,
      sender: item.sender,
      recipients: item.recipients,
    });

    return candidates.map((cand, idx) => {
      const isWaiting = cand.type === 'WAITING_FOR';
      return {
        id: `com_${item.source.toLowerCase()}_${item.id}_${idx}`,
        type: cand.type,
        title: cand.action,
        status: isWaiting ? 'WAITING' : 'PENDING',
        dueAt: cand.dueAt,
        createdAt: item.timestamp || new Date(),
        updatedAt: item.timestamp || new Date(),
        source: {
          provider: item.source,
          messageId: item.id,
          conversationId: item.conversationId,
          subject: item.subject,
          senderName: item.sender?.name,
          timestamp: item.timestamp.toISOString(),
        },
        person: cand.person || item.sender,
        confidence: cand.confidence,
        evidence: cand.evidence,
        isTentative: cand.isTentative,
      };
    });
  }

  /**
   * Analyzes raw message text with optional reference context.
   */
  public analyzeText(
    text: string,
    context?: {
      referenceDate?: Date;
      sender?: Person;
      recipients?: Person[];
    }
  ): ExtractedCommitmentCandidate[] {
    if (!text || !text.trim()) return [];

    const refDate = context?.referenceDate || new Date();
    const sentences = this.splitIntoSentences(text);
    const candidates: ExtractedCommitmentCandidate[] = [];

    for (const sentence of sentences) {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length < 5) continue;

      // Extract date references if present in the sentence
      const dateExpressions = dateResolver.extractExpressions(cleanSentence, refDate);
      const topDate = dateExpressions.length > 0 ? dateExpressions[0].resolvedDate : undefined;

      // 1. PROMISE / FOLLOW_UP detection: "I will send...", "I'll do...", "I'll confirm..."
      const promiseMatch = cleanSentence.match(
        /\b(?:i\s+will|i'll|i\s+promise\s+to|will\s+make\s+sure\s+to|i\s+shall|i\s+can\s+send)\s+([a-z0-9\s,'"-]+?)(?:\.|\?|!|;|$|\bby\b|\bbefore\b)/i
      );
      if (promiseMatch) {
        const rawAction = promiseMatch[1].trim();
        const action = this.cleanActionPhrase(rawAction);
        const evalRes = confidenceEngine.evaluate(cleanSentence, !!topDate);

        const isFollowUp = /\bconfirm\b/i.test(action) || /\bcheck\s+back\b/i.test(action);
        const type: CommitmentType = isFollowUp ? 'FOLLOW_UP' : 'PROMISE';

        if (evalRes.confidence >= 0.35 && action.length >= 3) {
          candidates.push({
            type,
            action: this.formatActionTitle(action),
            dueAt: topDate,
            person: context?.sender,
            evidence: cleanSentence,
            confidence: evalRes.confidence,
            isTentative: evalRes.isTentative,
          });
          continue;
        }
      }

      // 2. REQUEST / DEADLINE detection: "Please submit...", "Can you send...", "Could you provide..."
      const requestMatch = cleanSentence.match(
        /\b(?:please\s+|can\s+you\s+(?:please\s+)?|could\s+you\s+(?:please\s+)?|kindly\s+|required\s+to\s+)?(submit|send|review|provide|get|forward|share|fill\s+out)\s+([a-z0-9\s,'"-]+?)(?:\.|\?|!|;|$|\bby\b|\bbefore\b)/i
      );
      if (requestMatch) {
        const verb = requestMatch[1].trim();
        const rawObject = requestMatch[2].trim();
        const action = `${verb} ${this.cleanActionPhrase(rawObject)}`.trim();
        const evalRes = confidenceEngine.evaluate(cleanSentence, !!topDate);

        const type: CommitmentType = topDate ? 'DEADLINE' : 'REQUEST';

        if (evalRes.confidence >= 0.35 && action.length > 3) {
          candidates.push({
            type,
            action: this.formatActionTitle(action),
            dueAt: topDate,
            person: context?.sender,
            evidence: cleanSentence,
            confidence: evalRes.confidence,
            isTentative: evalRes.isTentative,
          });
          continue;
        }
      }

      // 3. WAITING_FOR detection: "Waiting for...", "Waiting on Rahul...", "Awaiting HR response"
      const waitingMatch = cleanSentence.match(
        /\b(?:waiting\s+(?:for|on)|awaiting|pending)\s+([a-z0-9\s,'"-]+?)(?:\.|\?|!|;|$)/i
      );
      if (waitingMatch) {
        const rawTarget = waitingMatch[1].trim();
        const evalRes = confidenceEngine.evaluate(cleanSentence, !!topDate);

        // Attempt person extraction from "waiting for <Person>"
        const resolvedPerson = this.resolvePersonFromText(rawTarget, context?.sender);

        if (evalRes.confidence >= 0.35) {
          candidates.push({
            type: 'WAITING_FOR',
            action: `Waiting on ${rawTarget}`,
            dueAt: topDate,
            person: resolvedPerson,
            evidence: cleanSentence,
            confidence: evalRes.confidence,
            isTentative: evalRes.isTentative,
          });
          continue;
        }
      }

      // 4. FOLLOW_UP detection: "I'll confirm tomorrow", "Let's follow up...", "Will check back"
      const followUpMatch = cleanSentence.match(
        /\b(?:i'll\s+confirm|will\s+confirm|follow\s+up|check\s+back|get\s+back\s+to\s+you)\b/i
      );
      if (followUpMatch) {
        const evalRes = confidenceEngine.evaluate(cleanSentence, !!topDate);
        if (evalRes.confidence >= 0.35) {
          candidates.push({
            type: 'FOLLOW_UP',
            action: 'Confirm and follow up',
            dueAt: topDate,
            person: context?.sender,
            evidence: cleanSentence,
            confidence: evalRes.confidence,
            isTentative: evalRes.isTentative,
          });
          continue;
        }
      }

      // 5. Generic DEADLINE / TASK detection: "submit the form by tomorrow", "send resume by Friday"
      if (topDate && /\b(submit|send|deliver|complete|file|prepare|finalize)\b/i.test(cleanSentence)) {
        const evalRes = confidenceEngine.evaluate(cleanSentence, true);
        if (evalRes.confidence >= 0.35) {
          candidates.push({
            type: 'DEADLINE',
            action: this.extractMainVerbClause(cleanSentence),
            dueAt: topDate,
            person: context?.sender,
            evidence: cleanSentence,
            confidence: evalRes.confidence,
            isTentative: evalRes.isTentative,
          });
        }
      }
    }

    return candidates;
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/(?<=[.?!;])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private cleanActionPhrase(phrase: string): string {
    return phrase
      .replace(/\b(tomorrow|today|yesterday|by eod|friday|monday|next week)\b/gi, '')
      .replace(/\b(to\s+me|to\s+you|for\s+you|please|kindly)\b/gi, '')
      .trim();
  }

  private formatActionTitle(action: string): string {
    const clean = action.charAt(0).toUpperCase() + action.slice(1);
    return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
  }

  private extractMainVerbClause(sentence: string): string {
    const match = sentence.match(/\b(submit|send|deliver|complete|file|prepare|finalize)\s+([a-z0-9\s]+?)(?:\s+by|\s+before|\.|\?|$)/i);
    if (match) {
      return this.formatActionTitle(`${match[1]} ${match[2]}`.trim());
    }
    return this.formatActionTitle(sentence.slice(0, 50));
  }

  private resolvePersonFromText(text: string, defaultPerson?: Person): Person | undefined {
    // Check known names or capital words
    const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    if (match) {
      return { name: match[1] };
    }
    if (/\b(hr|manager|team|boss|client)\b/i.test(text)) {
      const roleMatch = text.match(/\b(hr|manager|team|boss|client)\b/i);
      return { name: roleMatch ? roleMatch[1].toUpperCase() : 'Team' };
    }
    return defaultPerson;
  }
}

export const messageAnalyzer = new MessageAnalyzer();
