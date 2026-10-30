/**
 * Foundry Document Assistant Engine
 * Performs intelligent document reasoning:
 * - Summarize documents
 * - Compare two documents / PDFs
 * - Extract actionable items and tasks
 * - Extract important dates, deadlines, and milestones
 */

import { computerService } from '@/services/native/computerService';

export interface DocumentSummaryResult {
  fileName: string;
  path: string;
  wordCount: number;
  estimatedReadingTimeMinutes: number;
  keyPoints: string[];
  summary: string;
}

export interface DocumentComparisonResult {
  fileA: { name: string; path: string; wordCount: number };
  fileB: { name: string; path: string; wordCount: number };
  differences: string[];
  addedKeywords: string[];
  removedKeywords: string[];
  similarityEstimatePercent: number;
}

export interface ActionItemResult {
  item: string;
  assignedTo?: string;
  deadline?: string;
  priority?: 'low' | 'medium' | 'high';
}

export class DocumentAssistantEngine {
  /**
   * Summarize a document by reading its content
   */
  async summarizeDocument(path: string, maxChars: number = 20000): Promise<DocumentSummaryResult> {
    const rawContent = await computerService.readFileContent(path, maxChars);
    const fileName = path.split(/[/\\]/).pop() || 'document';

    if (!rawContent || !rawContent.trim()) {
      return {
        fileName,
        path,
        wordCount: 0,
        estimatedReadingTimeMinutes: 0,
        keyPoints: ['No readable text content found in document.'],
        summary: `The document at "${path}" appears to be empty or contains non-extractable content.`,
      };
    }

    const words = rawContent.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Extract key sentences / bullet points heuristically
    const sentences = rawContent
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 250);

    const keyPoints = sentences.slice(0, 5);

    return {
      fileName,
      path,
      wordCount,
      estimatedReadingTimeMinutes: readingTime,
      keyPoints: keyPoints.length > 0 ? keyPoints : [rawContent.slice(0, 200)],
      summary: `Document contains ${wordCount} words (~${readingTime} min read). Key highlights:\n` +
        keyPoints.map((kp) => `- ${kp}`).join('\n'),
    };
  }

  /**
   * Compare two documents/PDFs and identify textual & structural differences
   */
  async compareDocuments(pathA: string, pathB: string): Promise<DocumentComparisonResult> {
    const [contentA, contentB] = await Promise.all([
      computerService.readFileContent(pathA, 25000),
      computerService.readFileContent(pathB, 25000),
    ]);

    const nameA = pathA.split(/[/\\]/).pop() || 'Document A';
    const nameB = pathB.split(/[/\\]/).pop() || 'Document B';

    const wordsA = new Set((contentA || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
    const wordsB = new Set((contentB || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || []);

    const added: string[] = [];
    const removed: string[] = [];

    for (const w of wordsB) {
      if (!wordsA.has(w)) added.push(w);
    }
    for (const w of wordsA) {
      if (!wordsB.has(w)) removed.push(w);
    }

    // Jaccard similarity index
    const intersectionSize = Array.from(wordsA).filter((w) => wordsB.has(w)).length;
    const unionSize = new Set([...Array.from(wordsA), ...Array.from(wordsB)]).size;
    const similarityPercent = unionSize > 0 ? Math.round((intersectionSize / unionSize) * 100) : 0;

    const differences: string[] = [
      `Word count: ${nameA} has ${(contentA || '').split(/\s+/).length} words; ${nameB} has ${(contentB || '').split(/\s+/).length} words.`,
      `Estimated textual overlap: ${similarityPercent}%.`,
    ];

    if (added.length > 0) {
      differences.push(`Concepts present in ${nameB} but not in ${nameA}: ${added.slice(0, 8).join(', ')}.`);
    }
    if (removed.length > 0) {
      differences.push(`Concepts present in ${nameA} but missing in ${nameB}: ${removed.slice(0, 8).join(', ')}.`);
    }

    return {
      fileA: { name: nameA, path: pathA, wordCount: (contentA || '').split(/\s+/).length },
      fileB: { name: nameB, path: pathB, wordCount: (contentB || '').split(/\s+/).length },
      differences,
      addedKeywords: added.slice(0, 15),
      removedKeywords: removed.slice(0, 15),
      similarityEstimatePercent: similarityPercent,
    };
  }

  /**
   * Extract action items, tasks, and to-dos from a document
   */
  async extractActionItems(path: string): Promise<ActionItemResult[]> {
    const content = await computerService.readFileContent(path, 30000);
    if (!content) return [];

    const lines = content.split(/\r?\n/);
    const actionItems: ActionItemResult[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Check for action verbs or checkboxes
      if (/^(?:[-*•]|\d+\.)\s*(?:TODO|Action|Ensure|Submit|Review|Update|Send|Complete|Fix|Schedule|Verify)\b/i.test(trimmed) ||
          /\[\s*\]\s*.+/i.test(trimmed)) {
        actionItems.push({
          item: trimmed.replace(/^[-*•[\]\d.]+\s*/, ''),
          priority: /urgent|asap|critical|high priority/i.test(trimmed) ? 'high' : 'medium',
        });
      }
    }

    return actionItems.slice(0, 20);
  }

  /**
   * Extract important dates, deadlines, and time references from a document
   */
  async extractDates(path: string): Promise<{ dateStr: string; context: string }[]> {
    const content = await computerService.readFileContent(path, 30000);
    if (!content) return [];

    const dateRegex = /\b(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi;
    const matches: { dateStr: string; context: string }[] = [];

    const sentences = content.split(/(?<=[.?!])\s+/);
    for (const s of sentences) {
      const found = s.match(dateRegex);
      if (found) {
        for (const f of found) {
          matches.push({
            dateStr: f,
            context: s.trim().slice(0, 150),
          });
        }
      }
    }

    return matches.slice(0, 15);
  }
}

export const documentAssistantEngine = new DocumentAssistantEngine();
