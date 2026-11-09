/**
 * Resolves a follow-up reference ("the second one", "that file", "the other PDF") against the
 * result set from the previous turn. Ambiguous or missing context is reported honestly — never a
 * silent guess at which file the person means.
 */
import { IndexedFile } from '@/types/file';
import { QueryPlan } from './queryPlanner';
import { FileSearchArgs, ComparisonMatch, detectComparison } from './directRouter';

export interface ConversationContext {
  /** The ordered file result set from the previous turn, if any. */
  lastFiles: IndexedFile[];
  lastPlan?: QueryPlan;
  /** The real searchFiles/countFiles arguments the previous turn actually used, when it was a direct
   * file search — lets a bare comparison follow-up ("what about the smallest one?") redo the same
   * search with a different sort instead of only re-indexing into the (often single-item) result list. */
  lastSearchArgs?: FileSearchArgs;
}

export type ReferenceResolution =
  | { kind: 'resolved'; files: IndexedFile[] }
  | { kind: 'ambiguous'; candidates: IndexedFile[] }
  | { kind: 'no_context' }
  | { kind: 'not_a_reference' };

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  last: -1,
};

const ORDINAL_RE = /\b(first|second|third|fourth|fifth|last)\b(?:\s+(?:one|file|document|pdf))?/i;
const NUMBER_RE = /\b(?:number|#)\s*(\d{1,2})\b/i;
const PRONOUN_RE = /\b(it|that file|that one|this file|this one|that document|this document)\b/i;
/** "the other PDF", "the other one", "another one": everything but the file already singled out. */
const OTHER_RE = /\bthe other\b(?:\s+\w+)?|\banother\s+(?:one|pdf|file|document)\b/i;

/** Does this input look like it refers back to a result from an earlier turn? */
export function isFollowUpReference(input: string): boolean {
  return ORDINAL_RE.test(input) || NUMBER_RE.test(input) || OTHER_RE.test(input) || PRONOUN_RE.test(input);
}

/** "what about the smallest one?", "and the oldest one" after a size/age comparison search: a
 * generic referent ("one"/"instead") plus a new comparison word. Picking from the previous turn's
 * result set isn't enough here — that set may hold only the single largest file — so this is
 * recognized separately and answered by redoing the previous search with the new sort direction. */
const FOLLOWUP_CUE_RE = /\b(what about|how about|and the|show me the|instead|one)\b/i;

export function detectComparisonFollowUp(input: string, context: ConversationContext | undefined): ComparisonMatch | null {
  if (!context?.lastSearchArgs || !FOLLOWUP_CUE_RE.test(input)) return null;
  return detectComparison(input);
}

export function resolveReference(input: string, context: ConversationContext | undefined): ReferenceResolution {
  if (!isFollowUpReference(input)) {
    return { kind: 'not_a_reference' };
  }
  if (!context || context.lastFiles.length === 0) {
    return { kind: 'no_context' };
  }

  const numberMatch = input.match(NUMBER_RE);
  const ordinalMatch = input.match(ORDINAL_RE);
  if (numberMatch || ordinalMatch) {
    const n = numberMatch ? Number(numberMatch[1]) : ORDINAL_WORDS[ordinalMatch![1].toLowerCase()];
    const idx = n === -1 ? context.lastFiles.length - 1 : n - 1;
    const file = context.lastFiles[idx];
    return file ? { kind: 'resolved', files: [file] } : { kind: 'ambiguous', candidates: context.lastFiles };
  }

  if (OTHER_RE.test(input)) {
    if (context.lastFiles.length === 1) return { kind: 'no_context' };
    const rest = context.lastFiles.slice(1);
    return rest.length === 1 ? { kind: 'resolved', files: rest } : { kind: 'ambiguous', candidates: rest };
  }

  // Pronoun ("it", "that file"): unambiguous only when exactly one file was in play last turn.
  return context.lastFiles.length === 1
    ? { kind: 'resolved', files: context.lastFiles }
    : { kind: 'ambiguous', candidates: context.lastFiles };
}
