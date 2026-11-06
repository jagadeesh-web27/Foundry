/**
 * Grounded answers: turn retrieved evidence into a cited answer, or say plainly that there isn't
 * enough evidence. Never summarizes or invents content the model wasn't actually given.
 */
import { IndexedFile } from '@/types/file';
import { AIService } from '@/services/ai/aiService';
import { computerTools, AgentContext } from './tools';
import { QueryPlan } from './queryPlanner';

export type SourceLabel = 'files' | 'device' | 'general' | 'mixed';

export interface Citation {
  /** 1-based, matches the "[n]" marker in `message`. */
  index: number;
  path: string;
  name: string;
}

export interface GroundedResult {
  message: string;
  citations: Citation[];
  sourceLabel: SourceLabel;
  files: IndexedFile[];
}

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  "I couldn't find enough information in your files to answer that.";

/** A candidate is worth trying to read unless the index already knows its text isn't usable. */
function mightHaveUsableText(file: IndexedFile): boolean {
  return file.extractionStatus === undefined || file.extractionStatus === 'ok';
}

/**
 * Remove any "[n]" marker that doesn't correspond to a real piece of evidence. The model is
 * instructed to cite, but it is not trusted to cite correctly.
 */
export function stripInvalidCitations(message: string, evidenceCount: number): string {
  return message.replace(/\[(\d+)\]/g, (whole, n) => {
    const i = Number(n);
    return i >= 1 && i <= evidenceCount ? whole : '';
  });
}

/**
 * Build a grounded, cited answer from candidate files. Reads each candidate's real text (never
 * trusts the index snippet alone), keeps only what actually has usable content, and asks the model
 * to answer strictly from that evidence with [n] citations. If nothing usable was found, says so
 * instead of guessing.
 */
export async function answerFromEvidence(
  _plan: QueryPlan,
  userInput: string,
  candidates: IndexedFile[],
  context: AgentContext,
  ai: { service: AIService; available: boolean } | undefined,
  maxEvidence = 5,
): Promise<GroundedResult> {
  const worthTrying = candidates.filter(mightHaveUsableText).slice(0, maxEvidence);

  const evidence: { file: IndexedFile; text: string }[] = [];
  for (const file of worthTrying) {
    let text = '';
    try {
      text = String((await computerTools.readFile.execute({ path: file.path, maxChars: 4000 }, context)) || '').trim();
    } catch {
      text = '';
    }
    if (text.length >= 20) evidence.push({ file, text });
  }

  if (evidence.length === 0) {
    return { message: INSUFFICIENT_EVIDENCE_MESSAGE, citations: [], sourceLabel: 'files', files: [] };
  }

  const citations: Citation[] = evidence.map((e, i) => ({ index: i + 1, path: e.file.path, name: e.file.name }));

  if (!ai?.available) {
    const names = evidence.map((e) => e.file.name).join(', ');
    return {
      message: `I found ${evidence.length === 1 ? 'this file' : `these ${evidence.length} files`} (${names}), but the on-device AI is not ready yet to answer from them.`,
      citations,
      sourceLabel: 'files',
      files: evidence.map((e) => e.file),
    };
  }

  const evidenceBlock = evidence.map((e, i) => `[${i + 1}] ${e.file.name}:\n${e.text.slice(0, 3000)}`).join('\n\n---\n\n');
  const system =
    'You are Foundry. Answer the question using ONLY the numbered evidence below, never outside knowledge. ' +
    'Cite the evidence you use with [1], [2] and so on right after each claim it supports. ' +
    "If the evidence doesn't fully answer the question, say plainly what's missing instead of guessing.";

  let raw = '';
  try {
    raw = await ai.service.getProvider().chat([
      { role: 'system', content: system },
      { role: 'user', content: `Evidence:\n${evidenceBlock}\n\nQuestion: ${userInput}` },
    ]);
  } catch {
    raw = '';
  }

  const message = stripInvalidCitations(raw.trim(), evidence.length) || INSUFFICIENT_EVIDENCE_MESSAGE;
  const usedIndices = new Set(Array.from(message.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
  const usedCitations = citations.filter((c) => usedIndices.has(c.index));

  return {
    message,
    citations: usedCitations.length ? usedCitations : citations,
    sourceLabel: 'files',
    files: evidence.map((e) => e.file),
  };
}

/** Which source label to show given what kinds of evidence actually contributed to the answer. */
export function sourceLabelFor(usedFiles: boolean, usedDevice: boolean): SourceLabel {
  if (usedFiles && usedDevice) return 'mixed';
  if (usedFiles) return 'files';
  if (usedDevice) return 'device';
  return 'general';
}
