/**
 * The one canonical query planner.
 *
 * Builds a single typed `QueryPlan` for every chat message. It reuses `directRouter.ts`'s
 * `routeQuery` (already well-tested) for the file/device classification it already does well,
 * and adds the intents `routeQuery` does not model: `compare`, `relate`, `general`, `date_time`,
 * and the `find` vs `recent` distinction.
 *
 * This does not replace `directRouter.ts`, `agentRunner.ts`'s own fallback classifier, or
 * `dynamicAgent.ts` outright — a concrete behavioral difference was found between `routeQuery`
 * and `agentRunner`'s separate folder/file classifier for phrasing such as
 * "is there any folder I created today" (routeQuery treats it as a file search; agentRunner's
 * classifier correctly treats it as a folder search), so wiring this in as a blind pre-empting
 * router would have silently changed answers for cases the existing classifiers already get
 * right. `QueryPlan` is the new shared contract for code that doesn't exist yet (grounded
 * answers, follow-up reference resolution) and a safe place to grow consolidation from.
 */
import { routeQuery, normalizeInput, looksLikeGeneralKnowledge, FileSearchArgs } from './directRouter';
import { answerClockQuestion } from './clockAnswers';

export type Intent =
  | 'general'
  | 'find'
  | 'count'
  | 'read'
  | 'summarize'
  | 'compare'
  | 'relate'
  | 'device'
  | 'open'
  | 'recent'
  | 'date_time';

export interface FileFilters {
  /** Match by file/folder name. */
  nameQuery?: string;
  /** Match by document content ("files about X", "mentioning Y"). */
  contentQuery?: string;
  extensions?: string[];
  dateRange?: { from?: string; to?: string };
  scope?: 'file' | 'folder';
  sortBy?: 'modified' | 'created' | 'size' | 'name';
}

export interface QueryPlan {
  intent: Intent;
  /** Heuristic confidence in [0, 1]; low for the general-knowledge catch-all. */
  confidence: number;
  fileFilters?: FileFilters;
  /** Set when intent is 'open' (launching an installed application). */
  applicationName?: string;
  /** Set when intent is 'compare' or 'relate': the named things/files to compare or relate. */
  compareTargets?: string[];
  /** Unresolved follow-up references ("the second one", "that file", "the other PDF"). */
  targetRefs?: string[];
  requiresConfirmation?: boolean;
  label?: string;
  rawQuery: string;
}

function fromFileSearchArgs(args: FileSearchArgs): FileFilters {
  const extensions: string[] = [];
  if (args.extension) extensions.push(args.extension);
  if (args.fileTypes) extensions.push(...args.fileTypes);
  const hasDate = args.createdAfter || args.createdBefore || args.modifiedAfter || args.modifiedBefore;
  const dateRange = hasDate
    ? { from: args.createdAfter ?? args.modifiedAfter, to: args.createdBefore ?? args.modifiedBefore }
    : undefined;
  return {
    nameQuery: args.content ? undefined : args.query,
    contentQuery: args.content ? args.query : undefined,
    extensions: extensions.length ? extensions : undefined,
    dateRange,
    sortBy: args.sortBy,
  };
}

/** "compare the resume with the cover letter", "difference between plan A and plan B". */
const COMPARE_RE = /\b(compar(?:e|ing|ison)|difference(?:s)?\s+between)\b/i;
/** "how does X relate to Y", "connection between X and Y", "how are these two documents related". */
const RELATE_RE = /\b(relat(?:e|ed|ionship)|connect(?:ion|ed)?|link(?:ed)?)\b/i;
/** An imperative find/search command ("find documents related to X") is a content search, not a relate question. */
const IMPERATIVE_FIND_RE = /^(?:please\s+|can you\s+|could you\s+)?(?:find|search|locate|show|give|get|list|where|look for|display|fetch)\b/i;
/** "connected to the internet/wifi" is device connectivity, not a file-relation question. */
const CONNECTIVITY_RE = /\b(internet|wi-?fi|network|bluetooth|vpn|server)\b/i;

function extractCompareTargets(input: string): string[] | undefined {
  const m = input.match(/\b(?:between|compar\w*)\b\s+(.+)/i);
  if (!m) return undefined;
  const parts = m[1]
    .split(/\band\b|\bwith\b|\bvs\.?\b|\bversus\b|,/i)
    .map((s) => s.trim().replace(/[.?!]+$/, ''))
    .filter(Boolean);
  return parts.length >= 2 ? parts : undefined;
}

/**
 * Classify one user message into a single structured plan. Pure and synchronous: no tool calls.
 */
export function planQuery(rawInput: string): QueryPlan {
  const input = rawInput.trim();
  if (!input) {
    return { intent: 'general', confidence: 0, rawQuery: rawInput };
  }

  // The device clock, never the model: checked first everywhere else in the app too.
  if (answerClockQuestion(input) !== null) {
    return { intent: 'date_time', confidence: 0.95, rawQuery: rawInput };
  }

  // Compare/relate are checked before file/device routing: routeQuery's generic "my X" search
  // heuristic would otherwise swallow a phrase like "compare my resume with my cover letter".
  // An imperative find command ("find documents related to X") is a content search, not this.
  if (!IMPERATIVE_FIND_RE.test(input)) {
    if (COMPARE_RE.test(input)) {
      return { intent: 'compare', confidence: 0.65, compareTargets: extractCompareTargets(input), rawQuery: rawInput };
    }
    if (!CONNECTIVITY_RE.test(input) && RELATE_RE.test(input)) {
      return { intent: 'relate', confidence: 0.6, compareTargets: extractCompareTargets(input), rawQuery: rawInput };
    }
  }

  const normalizedForGk = normalizeInput(input);
  // Mirrors agentRunner.ts's own gate: a knowledge question that happens to mention a device/file
  // word ("explain how wifi works", "what is RAM") must not be misrouted as a device/file query.
  if (looksLikeGeneralKnowledge(normalizedForGk)) {
    return { intent: 'general', confidence: 0.8, rawQuery: rawInput };
  }

  const route = routeQuery(input);
  if (route) {
    switch (route.kind) {
      case 'battery':
      case 'network':
      case 'disk':
      case 'system':
        return { intent: 'device', confidence: 0.9, rawQuery: rawInput };

      case 'open_app':
        return {
          intent: 'open',
          confidence: 0.9,
          applicationName: route.application,
          requiresConfirmation: true,
          rawQuery: rawInput,
        };

      case 'folders':
        return {
          intent: 'find',
          confidence: 0.85,
          fileFilters: { nameQuery: route.nameQuery, scope: 'folder' },
          label: route.nameQuery,
          rawQuery: rawInput,
        };

      case 'count':
        return {
          intent: 'count',
          confidence: 0.85,
          fileFilters: fromFileSearchArgs(route.args),
          label: route.label,
          rawQuery: rawInput,
        };

      case 'read': {
        const intent: Intent = /\bsummari[sz]e|\bsummary\b/i.test(input) ? 'summarize' : 'read';
        return {
          intent,
          confidence: 0.85,
          fileFilters: fromFileSearchArgs(route.args),
          label: route.label,
          rawQuery: rawInput,
        };
      }

      case 'search': {
        const timeDrivenOnly =
          !route.args.query && !route.args.extension && !route.args.fileTypes && !!route.args.sortBy;
        return {
          intent: timeDrivenOnly ? 'recent' : 'find',
          confidence: 0.85,
          fileFilters: fromFileSearchArgs(route.args),
          label: route.label,
          rawQuery: rawInput,
        };
      }
    }
  }

  return { intent: 'general', confidence: 0.35, rawQuery: rawInput };
}
