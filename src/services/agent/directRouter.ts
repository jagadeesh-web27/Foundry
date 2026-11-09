/**
 * Direct router: answers clear device / file questions with the real tools and no model call.
 *
 * Small on-device models are unreliable at choosing between ~40 tools and slow when the prompt
 * lists all of them. Questions like "what is my battery level" or "find my resume" have an
 * unambiguous tool, so they are routed by rules and answered instantly. Everything else
 * (general knowledge, open-ended requests) still goes to the AI.
 */
import { IndexedFile } from '@/types/file';
import { AIService } from '@/services/ai/aiService';
import { computerTools, AgentContext } from './tools';
import { answerFromEvidence, INSUFFICIENT_EVIDENCE_MESSAGE } from './groundedAnswer';

export interface FileSearchArgs {
  query?: string;
  extension?: string;
  fileTypes?: string[];
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  sortBy?: 'modified' | 'created' | 'size' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  scopePath?: string;
  /** The person asked about contents ("documents about X", "files mentioning Y"). */
  content?: boolean;
}

export interface TimeRange {
  field: 'created' | 'modified';
  after: Date;
  before?: Date;
  /** e.g. "added today", "modified this week" */
  label: string;
}

/** Words describing *when*; removed from the name/content query once understood as a date filter. */
const TIME_WORDS = new Set([
  'today', 'yesterday', 'this', 'last', 'past', 'week', 'weeks', 'month', 'months', 'day', 'days', 'recent',
  'add', 'download', 'downloads', 'create', 'save', 'receive', 'edit', 'change', 'update', 'modify',
  'recently', 'latest', 'newest', 'new', 'added', 'created', 'downloaded', 'saved', 'received', 'got', 'modified',
  'edited', 'changed', 'updated', 'worked', 'opened', 'ago', 'since', 'during',
]);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Understand "today", "yesterday", "this/last week", "this/last month", "last N days", "recent". */
export function detectTimeRange(text: string, now: Date = new Date()): TimeRange | null {
  const t = text.toLowerCase();
  const field: 'created' | 'modified' = /\b(add|added|create|created|download|downloads|downloaded|save|saved|receive|received|got|new)\b/.test(t) ? 'created' : 'modified';
  const verb = field === 'created' ? 'added' : 'modified';
  const today = startOfDay(now);
  const day = 24 * 60 * 60 * 1000;
  let after: Date | null = null;
  let before: Date | undefined;
  let when = '';

  const lastN = t.match(/\b(?:last|past)\s+(\d{1,3})\s+(day|days|week|weeks)\b/);
  if (lastN) {
    const n = Number(lastN[1]) * (lastN[2].startsWith('week') ? 7 : 1);
    after = new Date(today.getTime() - (n - 1) * day);
    when = `in the last ${lastN[1]} ${lastN[2]}`;
  } else if (/\btoday\b/.test(t)) {
    after = today;
    when = 'today';
  } else if (/\byesterday\b/.test(t)) {
    after = new Date(today.getTime() - day);
    before = today;
    when = 'yesterday';
  } else if (/\bthis week\b/.test(t)) {
    const mondayOffset = (today.getDay() + 6) % 7;
    after = new Date(today.getTime() - mondayOffset * day);
    when = 'this week';
  } else if (/\blast week\b/.test(t)) {
    const mondayOffset = (today.getDay() + 6) % 7;
    before = new Date(today.getTime() - mondayOffset * day);
    after = new Date(before.getTime() - 7 * day);
    when = 'last week';
  } else if (/\bthis month\b/.test(t)) {
    after = new Date(today.getFullYear(), today.getMonth(), 1);
    when = 'this month';
  } else if (/\blast month\b/.test(t)) {
    after = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    before = new Date(today.getFullYear(), today.getMonth(), 1);
    when = 'last month';
  } else if (/\b(recent|recently|latest|newest)\b/.test(t)) {
    after = new Date(today.getTime() - 6 * day);
    when = 'in the last 7 days';
  }
  if (!after) return null;
  return { field, after, before, label: `${verb} ${when}` };
}

export type DirectRoute =
  | { kind: 'battery' }
  | { kind: 'network' }
  | { kind: 'disk' }
  | { kind: 'system' }
  | { kind: 'count'; args: FileSearchArgs; label: string }
  | { kind: 'search'; args: FileSearchArgs; label: string; showAll: boolean; comparison?: Comparison; typeLabel?: string }
  | { kind: 'read'; args: FileSearchArgs; label: string }
  | { kind: 'folders'; nameQuery: string }
  | { kind: 'open_app'; application: string };

export interface DirectResponse {
  message: string;
  files?: IndexedFile[];
  folders?: any[];
  toolsExecuted: string[];
  pendingAction?: any;
  plan?: { intent: string; [key: string]: any };
}

const FILE_NOUN =
  /\b(files?|folders?|directories|docs?|documents?|pdfs?|docx?|xlsx?|csv|excel|word|powerpoint|pptx?|slides?|presentations?|spreadsheets?|photos?|pictures?|images?|screenshots?|videos?|movies?|recordings?|music|songs?|audio|resumes?|cv|invoices?|reports?|notes?|mp4s?|mkvs?|avis?|movs?|webms?|wmvs?|mp3s?|wavs?|flacs?|pngs?|jpgs?|jpegs?|gifs?|bmps?|heics?|txts?|zips?|rars?)\b/i;
/** Requests about what files say, not what they are called. */
const CONTENT_INTENT = /\b(about|related to|regarding|concerning|containing|contains?|mentioning|mentions?|discuss(es|ing)?|talks? about|that (say|says|mention|mentions))\b/;
const SEARCH_VERB = /\b(find|search|locate|show|give|get|list|where|look for|display|fetch|need|see)\b/i;
const READ_VERB = /\b(read|summari[sz]e|summary|what('?s| is) in|what does .* say)\b/i;

interface TypeMatch {
  extension?: string;
  fileTypes?: string[];
  label: string;
}

const FILLER = new Set([
  'find', 'search', 'locate', 'show', 'give', 'get', 'list', 'display', 'fetch', 'see', 'where', 'look', 'for',
  'is', 'are', 'my', 'me', 'the', 'a', 'an', 'all', 'every', 'any', 'of', 'on', 'in', 'from', 'to', 'please',
  'can', 'could', 'you', 'do', 'does', 'i', 'have', 'need', 'want', 'file', 'files', 'folder', 'folders',
  'document', 'documents', 'doc', 'docs', 'present', 'system', 'computer', 'phone', 'device', 'laptop', 'pc',
  'named', 'called', 'with', 'about', 'that', 'which', 'and', 'it', 'this', 'there', 'stored', 'saved', 'read',
  'summarize', 'summarise', 'summary', 'what', 'whats', "what's", 'many', 'how', 'count', 'number', 'open',
  'pdf', 'pdfs', 'word', 'docx', 'excel', 'xlsx', 'xls', 'spreadsheet', 'spreadsheets', 'powerpoint', 'pptx',
  'ppt', 'slides', 'presentation', 'presentations', 'csv', 'photo', 'photos', 'picture', 'pictures', 'image',
  'images', 'video', 'videos', 'movie', 'movies', 'music', 'audio', 'song', 'songs', 'screenshot', 'screenshots', 'recording', 'recordings',
  'related', 'regarding', 'concerning', 'containing', 'mentioning', 'mention', 'mentions', 'contain', 'contains',
  'has', 'have', 'had', 'did', 'last', 'some', 'by', 'at', 'or',
  // Raw extension words ("largest mp4"): a sort/type instruction, not part of the name query.
  'mp4', 'mp4s', 'mkv', 'mkvs', 'avi', 'avis', 'mov', 'movs', 'webm', 'webms', 'wmv', 'wmvs',
  'mp3', 'mp3s', 'wav', 'wavs', 'flac', 'flacs', 'png', 'pngs', 'jpg', 'jpgs', 'jpeg', 'jpegs',
  'gif', 'gifs', 'bmp', 'bmps', 'heic', 'heics', 'txt', 'txts', 'zip', 'zips', 'rar', 'rars',
]);

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Fix near-miss spellings of the words people search for most ("resme", "resumee"). */
function fixTypos(token: string): string {
  if (token.length >= 4 && levenshtein(token, 'resume') <= 1) return 'resume';
  if (token.length >= 4 && levenshtein(token, 'resumes') <= 1) return 'resume';
  if (token === 'cv') return 'resume';
  return token;
}

export function detectFileType(text: string): TypeMatch {
  if (/\bpdfs?\b/.test(text)) return { extension: 'pdf', label: 'PDF files' };
  if (/\b(word|docx?)\b/.test(text)) return { extension: 'docx', label: 'Word files' };
  if (/\b(excel|xlsx?)\b/.test(text)) return { extension: 'xlsx', label: 'Excel files' };
  if (/\bspreadsheets?\b/.test(text)) return { fileTypes: ['Spreadsheet'], label: 'spreadsheets' };
  if (/\b(powerpoint|pptx?|slides?|presentations?)\b/.test(text)) return { fileTypes: ['Presentation'], label: 'presentations' };
  if (/\bcsv\b/.test(text)) return { extension: 'csv', label: 'CSV files' };
  if (/\b(photos?|pictures?|images?|screenshots?)\b/.test(text)) return { fileTypes: ['Image'], label: 'photos' };
  if (/\b(videos?|recordings?|movies?)\b/.test(text)) return { fileTypes: ['Video'], label: 'videos' };
  if (/\b(music|songs?|audio)\b/.test(text)) return { fileTypes: ['Audio'], label: 'audio files' };
  const rawExt = text.match(/\b(mp4|mkv|avi|mov|webm|wmv|mp3|wav|flac|png|jpg|jpeg|gif|bmp|heic|txt|zip|rar)s?\b/);
  if (rawExt) return { extension: rawExt[1], label: `${rawExt[1].toUpperCase()} files` };
  return { label: 'files' };
}

/** Scope words not already in FILLER (which already strips the type-ambiguous ones: "documents",
 * "photos", "music", ...); stripped from the query only once detectScope has actually matched them,
 * same as TIME_WORDS and COMPARISON_WORDS. */
const SCOPE_WORDS = new Set(['download', 'downloads', 'dcim', 'camera', 'desktop', 'inside', 'under']);

export function extractQuery(text: string, dropTimeWords = false, dropComparisonWords = false, dropScopeWords = false): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_.-]/g, ' ')
    .split(/\s+/)
    .filter((t) =>
      t &&
      !FILLER.has(t) &&
      !(dropTimeWords && (TIME_WORDS.has(t) || /^\d{1,4}$/.test(t))) &&
      !(dropComparisonWords && (COMPARISON_WORDS.has(t) || /^\d{1,4}$/.test(t))) &&
      !(dropScopeWords && SCOPE_WORDS.has(t)),
    )
    .map(fixTypos);
  return tokens.join(' ').trim();
}

/** Correct near-miss spellings of key words ("resme" -> "resume") before intent detection. */
export function normalizeInput(userInput: string): string {
  return userInput.replace(/[A-Za-z]+/g, (word) => {
    const fixed = fixTypos(word.toLowerCase());
    return fixed !== word.toLowerCase() && fixed === 'resume' && word.toLowerCase() !== 'cv' ? fixed : word;
  });
}

/**
 * True for knowledge questions that should go to the AI even if they mention a device word
 * ("what is RAM", "explain how wifi works"). Personal phrasing ("my", "do I have") is not general —
 * and neither is a size/age comparison ("what is the largest file in Downloads?"), even without an
 * explicit "my": found live on a real device, where this phrase (no "my") was misrouted to the AI,
 * which fabricated an answer ("647 GB was downloaded last week") instead of running a real search.
 */
export function looksLikeGeneralKnowledge(text: string): boolean {
  const t = text.trim().toLowerCase();
  const starts = /^(?:what is|what are|what's|explain|who is|who was|why is|why do|how do|how does|how to|write|code|tell me about|translate|convert|define|meaning of)\b/.test(t);
  const personal = /\b(my|mine|do i have|i have|on my|this (computer|laptop|phone|device))\b/.test(t);
  return starts && !personal && !detectComparison(t);
}

// Questions about Foundry's own task / goal / calendar features are not file searches.
const APP_DOMAIN = /\b(tasks?|todos?|goals?|calendar|meetings?|emails?|messages?|schedule|commitments?|follow-?ups?|pending|today|tomorrow|agenda)\b/;

/**
 * Comparative file search: "the larger video", "which document uses the most storage", "show the
 * smallest image". One canonical detector shared by directRouter, the no-AI fallback in
 * agentRunner, and dynamicAgent's tool-argument normalization, so a comparison word is never
 * treated as a literal filename query by any of them.
 */
export type Comparison = 'largest' | 'smallest' | 'newest' | 'oldest';

export interface ComparisonMatch {
  comparison: Comparison;
  sortBy: 'size' | 'modified' | 'created';
  sortOrder: 'asc' | 'desc';
}

const SIZE_DESC_RE =
  /\b(largest|biggest|larger|bigger|large|big|highest\s+size|large\s+size|biggest\s+size|takes?\s+(?:the\s+)?most\s+(?:space|storage|room)|uses?\s+(?:the\s+)?most\s+(?:space|storage)|occupies?\s+(?:the\s+)?most\s+(?:space|storage)|most\s+(?:storage|space))\b/i;
const SIZE_ASC_RE =
  /\b(smallest|tiniest|smaller|small|lowest\s+size|small\s+size|takes?\s+(?:the\s+)?least\s+(?:space|storage|room)|uses?\s+(?:the\s+)?least\s+(?:space|storage)|least\s+(?:storage|space))\b/i;
const DATE_ASC_RE = /\b(oldest|earliest)\b/i;

/** Words consumed by a detected comparison; stripped from the name/content query, same strategy as TIME_WORDS. */
export const COMPARISON_WORDS = new Set([
  'largest', 'biggest', 'larger', 'bigger', 'large', 'big',
  'smallest', 'tiniest', 'smaller', 'small',
  'highest', 'lowest', 'most', 'least', 'size',
  'takes', 'take', 'taking', 'uses', 'use', 'using', 'occupies', 'occupy', 'occupying',
  'space', 'storage', 'room', 'oldest', 'earliest',
]);

/** Detects a size or age superlative. "newest"/"latest"/"recent" are intentionally left to
 * detectTimeRange, which already turns them into a date filter + default sort; adding a second,
 * competing path for the same words would just re-create the duplication this is meant to remove. */
export function detectComparison(text: string): ComparisonMatch | null {
  const t = text.toLowerCase();
  if (SIZE_ASC_RE.test(t)) return { comparison: 'smallest', sortBy: 'size', sortOrder: 'asc' };
  if (SIZE_DESC_RE.test(t)) return { comparison: 'largest', sortBy: 'size', sortOrder: 'desc' };
  if (DATE_ASC_RE.test(t)) return { comparison: 'oldest', sortBy: 'modified', sortOrder: 'asc' };
  return null;
}

// The scope filter is a case-insensitive SUBSTRING match against the real file path (see index.rs),
// so the shorter form must be used wherever platforms disagree on plural: Android's real folder is
// "Download" (singular — Android's own DIRECTORY_DOWNLOADS constant's value is "Download", despite
// the name), Windows' is "Downloads" (plural). "download" matches inside both; "Downloads" would
// silently fail to match Android's real folder (found live on a real device: a real file in
// /storage/emulated/0/Download was reported as "not found" when searched "in Downloads").
const SCOPE_WORD_TO_FOLDER: { [key: string]: string } = {
  download: 'Download', downloads: 'Download',
  document: 'Documents', documents: 'Documents',
  picture: 'Pictures', pictures: 'Pictures',
  photo: 'DCIM', photos: 'DCIM', dcim: 'DCIM', camera: 'DCIM',
  movie: 'Movies', movies: 'Movies',
  music: 'Music',
  desktop: 'Desktop',
};
/** "in Downloads", "from DCIM". Requires a preposition so "my documents" (a file type) is not
 * mistaken for "in my documents" (a folder); "on my phone/computer" names a platform, not a real
 * folder, and is deliberately not in this map. */
export function detectScope(text: string): string | undefined {
  const m = text.toLowerCase().match(/\b(?:in|on|from|inside|under)\s+(?:my\s+)?(downloads?|documents?|pictures?|photos?|dcim|camera|movies?|music|desktop)\b/);
  return m ? SCOPE_WORD_TO_FOLDER[m[1]] : undefined;
}

const EXPLICIT_LIMIT_RE =
  /\btop\s+(\d{1,4})\b|\b(\d{1,4})\s+(?:largest|smallest|biggest|newest|oldest|most|least|files?|videos?|images?|photos?|pictures?|documents?|pdfs?|spreadsheets?|songs?|tracks?)\b/i;
/** "excel"/"word"/"music" etc. have no singular/plural distinction; a bare mention never implies a list. */
const UNCOUNTABLE_FILE_WORDS = new Set(['excel', 'word', 'powerpoint', 'csv', 'music', 'audio', 'directories']);

/** "the biggest PDF" (one answer) vs "find large videos" (a sorted list): told apart by whether the
 * file-category word the person actually typed is singular or plural, not by which phrase it is. */
function isPluralFileMention(text: string): boolean {
  const m = FILE_NOUN.exec(text.toLowerCase());
  if (!m) return false;
  const word = m[0];
  if (UNCOUNTABLE_FILE_WORDS.has(word)) return false;
  return word.endsWith('s');
}

/** An explicit count ("the 5 largest", "top 10") always wins; otherwise a comparison with a
 * singular file word ("the largest video") implies exactly one answer, a plural one ("large
 * videos") implies a sorted list with no forced cap. */
export function detectLimit(text: string, comparison: ComparisonMatch | null): number | undefined {
  const m = text.match(EXPLICIT_LIMIT_RE);
  if (m) {
    const n = Number(m[1] || m[2]);
    if (n > 0) return n;
  }
  if (comparison && !isPluralFileMention(text)) return 1;
  return undefined;
}

const FILE_TYPE_LABELS: { [key: string]: string } = {
  Video: 'videos', Image: 'photos', Audio: 'audio files', Spreadsheet: 'spreadsheets', Presentation: 'presentations', Document: 'documents',
};
function typeLabelFromArgs(args: FileSearchArgs): string {
  if (args.extension) return `${args.extension.toUpperCase()} files`;
  if (args.fileTypes?.[0]) return FILE_TYPE_LABELS[args.fileTypes[0]] ?? 'files';
  return 'files';
}

/**
 * Redo a previous turn's file search with a new size/age comparison ("what about the smallest
 * one?" after "the largest video"): reuses the earlier search's file-type/extension/scope, drops
 * its old sort and result count, and applies the new one. Used only for comparison follow-ups —
 * see referenceResolver.ts's detectComparisonFollowUp.
 */
export function buildComparisonRoute(baseArgs: FileSearchArgs, comparison: ComparisonMatch, rawInput: string): DirectRoute {
  const typeLabel = typeLabelFromArgs(baseArgs);
  const args: FileSearchArgs = {
    extension: baseArgs.extension,
    fileTypes: baseArgs.fileTypes,
    scopePath: baseArgs.scopePath,
    sortBy: comparison.sortBy,
    sortOrder: comparison.sortOrder,
  };
  const limit = detectLimit(rawInput, comparison);
  if (limit) args.limit = limit;
  const scopeSuffix = args.scopePath ? ` in ${args.scopePath}` : '';
  return {
    kind: 'search',
    args,
    label: `${comparison.comparison} ${typeLabel}${scopeSuffix}`,
    showAll: false,
    comparison: comparison.comparison,
    typeLabel,
  };
}

export function routeQuery(rawInput: string): DirectRoute | null {
  const raw = normalizeInput(rawInput).trim();
  if (!raw) return null;
  const text = raw.toLowerCase();
  const hasFileNoun = FILE_NOUN.test(text);

  // Launching an application: "open chrome", "launch calculator".
  const app = text.match(/^(?:please\s+|can you\s+|could you\s+)?(?:open|launch|start|run)\s+(?:the\s+)?([a-z0-9 .+#-]{2,40}?)(?:\s+app(?:lication)?)?[.?!]*$/);
  if (app && !hasFileNoun && !/\bmy\b/.test(text) && !/^(a|an|some|new|up|it|this)\b/.test(app[1]) && app[1].split(' ').length <= 3) {
    return { kind: 'open_app', application: app[1].trim() };
  }

  if (!hasFileNoun) {
    if (/\b(battery|charging|charger)\b/.test(text)) return { kind: 'battery' };
    if (/\b(wi-?fi|network|internet|ssid|ip address)\b/.test(text)) return { kind: 'network' };
    if (/\b(storage|disk|free space|hard drive|drives?|space (left|available)|how much space)\b/.test(text)) return { kind: 'disk' };
    if (/\b(cpu|processor|ram|memory|specs?|hardware|system info|os version|operating system|uptime|computer info|device info|phone info)\b/.test(text)) {
      return { kind: 'system' };
    }
  }

  // Folders
  if (/\b(folders?|directories|directory)\b/.test(text) && SEARCH_VERB.test(text)) {
    const nameQuery = extractQuery(text);
    if (nameQuery) return { kind: 'folders', nameQuery };
  }

  // "find my offer letter" / "where is my passport": a named personal item, not a known file type.
  const namedItem = !hasFileNoun && SEARCH_VERB.test(text) && /\bmy\b/.test(text) && !APP_DOMAIN.test(text);
  // "what did I download yesterday", "what have I saved this week": file activity in a time range.
  const fileActivity =
    !hasFileNoun && !!detectTimeRange(text) && /\b(download(ed)?|added|saved|edited|modified|changed|created|received)\b/.test(text);
  if (!hasFileNoun && !namedItem && !fileActivity && !READ_VERB.test(text)) return null;

  const type = detectFileType(text);
  const time = detectTimeRange(text);
  const comparison = detectComparison(text);
  const scope = detectScope(text);
  const query = extractQuery(text, !!time, !!comparison, !!scope);
  const args: FileSearchArgs = { extension: type.extension, fileTypes: type.fileTypes, query: query || undefined };
  if (query && CONTENT_INTENT.test(text)) args.content = true;
  if (scope) args.scopePath = scope;
  if (time) {
    const after = time.after.toISOString();
    const before = time.before?.toISOString();
    if (time.field === 'created') {
      args.createdAfter = after;
      args.createdBefore = before;
    } else {
      args.modifiedAfter = after;
      args.modifiedBefore = before;
    }
    if (!query) {
      args.sortBy = time.field;
      args.sortOrder = 'desc';
    }
  } else if (comparison) {
    // A comparison word is a sort instruction, never a filename ("the larger video" must not search
    // for a file literally named "larger"); detected and stripped before it ever reaches searchFiles.
    args.sortBy = comparison.sortBy;
    args.sortOrder = comparison.sortOrder;
  }
  const limit = detectLimit(text, comparison);
  if (limit) args.limit = limit;

  const compWord = comparison?.comparison;
  const typeWithComparison = compWord ? `${compWord} ${type.label}` : type.label;
  const base = query
    ? (args.content ? `${type.label} about "${query}"` : `${type.label} matching "${query}"`)
    : typeWithComparison;
  const scoped = scope ? `${base} in ${scope}` : base;
  const label = time ? `${scoped} ${time.label}` : scoped;

  if (/\b(how many|count|number of)\b/.test(text)) {
    return { kind: 'count', args, label };
  }
  if (READ_VERB.test(text) && (query || type.extension || type.fileTypes)) {
    return { kind: 'read', args, label: query || type.label };
  }
  if (SEARCH_VERB.test(text) || /\bmy\b/.test(text) || time || comparison) {
    if (!query && !type.extension && !type.fileTypes && !time && !comparison) return null;
    const showAll = /\b(all|every|list)\b/.test(text);
    return { kind: 'search', args, label, showAll, comparison: compWord, typeLabel: type.label };
  }
  return null;
}

function plural(n: number, singular: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${singular}s`;
}

const SINGULAR_TYPE_LABEL: { [key: string]: string } = {
  files: 'file', 'PDF files': 'PDF file', 'Word files': 'Word file', spreadsheets: 'spreadsheet',
  presentations: 'presentation', 'CSV files': 'CSV file', photos: 'photo', videos: 'video', 'audio files': 'audio file',
};
function singularizeTypeLabel(typeLabel: string): string {
  return SINGULAR_TYPE_LABEL[typeLabel] ?? (typeLabel.endsWith('s') ? typeLabel.slice(0, -1) : typeLabel);
}

function formatDisk(disks: any): string {
  const all = Array.isArray(disks) ? disks : [];
  // Android reports the same partition under several mount points; show each volume once.
  const seen = new Set<string>();
  const list = all.filter((d: any) => {
    const key = `${d.totalBytes}:${d.freeBytes}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list.length === 0) return "I couldn't read the disk information.";
  const rows = list.map(
    (d: any) =>
      `- **${String(d.drive).startsWith('/') ? 'Phone storage' : d.drive}** ${d.totalFormatted} total, ${d.freeFormatted} free (${Math.round(d.percentageUsed)}% used)`,
  );
  return `Here is your storage:\n${rows.join('\n')}`;
}

function formatSystem(s: any): string {
  const lines = [
    `- **OS:** ${s.osName} ${s.osVersion || ''}`.trim(),
    `- **CPU:** ${s.cpuBrand} (${s.cpuCores} cores / ${s.cpuLogicalCores} threads)`,
    `- **Memory:** ${s.usedRamFormatted} used of ${s.totalRamFormatted} (${Math.round(s.ramPercentageUsed)}%)`,
  ];
  if (s.uptimeFormatted) lines.push(`- **Uptime:** ${s.uptimeFormatted}`);
  return `Here are your system details:\n${lines.join('\n')}`;
}

function formatNetwork(n: any): string {
  if (!n.isConnected) return 'This device is not connected to a network.';
  const parts = [`Connected via **${n.connectionType}**`];
  if (n.wifiSsid) parts.push(`Wi-Fi network **${n.wifiSsid}**${n.wifiSignalPercent != null ? ` (${n.wifiSignalPercent}% signal)` : ''}`);
  if (n.primaryIp) parts.push(`IP address **${n.primaryIp}**`);
  parts.push(n.internetAccess ? 'Internet access is available' : 'No internet access detected');
  return `${parts.join(' · ')}.`;
}

async function searchWithFallback(args: FileSearchArgs, context: AgentContext, limit: number): Promise<IndexedFile[]> {
  const payload: any = { ...args, limit };
  let files = await computerTools.searchFiles.execute(payload, context);
  // Nothing matched the whole phrase (Android's search matches the phrase literally): retry with the
  // longest word, but keep only files whose name or folder contains every word. Without that filter,
  // "offer letter" returned "Radio_Button_Letter_by_Letter.png".
  if (files.length === 0 && args.query && args.query.includes(' ')) {
    const words = args.query.split(' ').filter(Boolean);
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    const normalize = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, ' ');
    const candidates = await computerTools.searchFiles.execute({ ...payload, query: longest, limit: 200 }, context);
    files = candidates
      .filter((f) => words.every((w) => normalize(f.name).includes(w) || normalize(f.path).includes(w)))
      .slice(0, limit);
  }
  return files;
}

/**
 * Run a routed question. Returns null when the AI is needed (read route without a model result is
 * still answered with the file card).
 */
export async function runDirectRoute(
  route: DirectRoute,
  userInput: string,
  context: AgentContext,
  ai?: { service: AIService; available: boolean },
): Promise<DirectResponse> {
  const tools: string[] = [];
  try {
    switch (route.kind) {
      case 'battery': {
        tools.push('getBatteryInformation');
        const b: any = await computerTools.getBatteryInformation.execute();
        const level = b?.level ?? b?.batteryPercentage;
        if (level == null) return { message: "I couldn't read a battery level. This computer may not have a battery.", toolsExecuted: tools };
        const temp = b.temperatureCelsius ? ` (${b.temperatureCelsius}°C)` : '';
        return { message: `Your battery is at **${level}%** and ${b.isCharging ? 'charging' : 'not charging'}${temp}.`, toolsExecuted: tools, plan: { intent: 'DIRECT_BATTERY' } };
      }
      case 'network': {
        tools.push('getNetworkInformation');
        return { message: formatNetwork(await computerTools.getNetworkInformation.execute()), toolsExecuted: tools, plan: { intent: 'DIRECT_NETWORK' } };
      }
      case 'disk': {
        tools.push('getDiskInformation');
        return { message: formatDisk(await computerTools.getDiskInformation.execute()), toolsExecuted: tools, plan: { intent: 'DIRECT_DISK' } };
      }
      case 'system': {
        tools.push('getSystemInfo');
        return { message: formatSystem(await computerTools.getSystemInfo.execute()), toolsExecuted: tools, plan: { intent: 'DIRECT_SYSTEM' } };
      }
      case 'count': {
        tools.push('countFiles');
        const r = await computerTools.countFiles.execute(route.args as any, context);
        return { message: `You have **${r.count}** ${route.label}.`, toolsExecuted: tools, plan: { intent: 'DIRECT_COUNT', searchArgs: route.args } };
      }
      case 'search': {
        tools.push('searchFiles');
        const fetchLimit = route.args.limit ?? (route.showAll ? 50 : 25);
        const files = await searchWithFallback(route.args, context, fetchLimit);
        if (files.length === 0) {
          return { message: `I couldn't find any ${route.label} on this device.`, toolsExecuted: tools, files: [], plan: { intent: 'DIRECT_SEARCH_NONE' } };
        }
        const shown = files.slice(0, route.args.limit ?? (route.showAll ? 20 : 5));
        if (route.comparison) {
          // Superlative ("the largest video"): real metadata from the actual top-ranked result, never
          // a guess, and truthful about how many more matched when the list was capped.
          const typeLabel = route.typeLabel ?? 'files';
          const scopeSuffix = route.args.scopePath ? ` in ${route.args.scopePath}` : '';
          if (shown.length === 1) {
            const f = shown[0];
            const sizeDisplay = (f as any).sizeFormatted || `${f.size || 0} bytes`;
            return {
              message: `The ${route.comparison} ${singularizeTypeLabel(typeLabel)} is **${f.name}** (${sizeDisplay}), located at \`${f.path}\`.`,
              toolsExecuted: tools,
              files: shown,
              plan: { intent: 'DIRECT_SEARCH_COMPARISON', searchArgs: route.args },
            };
          }
          const more = files.length > shown.length ? ` (of ${files.length} found)` : '';
          return {
            message: `Here are the ${route.comparison} ${shown.length} ${typeLabel}${scopeSuffix}${more}, sorted by size:`,
            toolsExecuted: tools,
            files: shown,
            plan: { intent: 'DIRECT_SEARCH_COMPARISON', searchArgs: route.args },
          };
        }
        const onlyMentions = !route.args.content && !!route.args.query && files.every((f) => f.matchIn === 'content');
        const n = files.length;
        const head = onlyMentions
          ? `I couldn't find a file named "${route.args.query}", but ${n === 1 ? '1 document mentions' : `${n} documents mention`} it${n > shown.length ? ` (showing ${shown.length})` : ''}:`
          : n === 1
            ? `I found 1 file for ${route.label}:`
            : `I found ${n} ${route.label}. Showing the top ${shown.length}:`;
        return { message: head, toolsExecuted: tools, files: shown, plan: { intent: 'DIRECT_SEARCH', searchArgs: route.args } };
      }
      case 'folders': {
        tools.push('searchFolders');
        const folders = await computerTools.searchFolders.execute({ nameQuery: route.nameQuery, limit: 25 }, context);
        if (folders.length === 0) return { message: `I couldn't find a folder matching "${route.nameQuery}".`, toolsExecuted: tools, folders: [] };
        return { message: `I found ${plural(folders.length, 'folder')} matching "${route.nameQuery}":`, toolsExecuted: tools, folders: folders.slice(0, 5), plan: { intent: 'DIRECT_FOLDERS' } };
      }
      case 'open_app': {
        tools.push('openApplication');
        const res: any = await computerTools.openApplication.execute({ application: route.application });
        if (!res.installed) return { message: res.message, toolsExecuted: tools };
        return {
          message: res.message,
          toolsExecuted: tools,
          pendingAction: { type: 'open_application', appName: res.appName, targetPath: res.targetPath, id: `act_${Date.now()}` },
        };
      }
      case 'read': {
        tools.push('searchFiles');
        const files = await searchWithFallback(route.args, context, 10);
        if (files.length === 0) return { message: `I couldn't find "${route.label}" on this device to read.`, toolsExecuted: tools, files: [] };
        // Grounded in the file's real text, with a citation marker, never a guess. Only the single
        // best-ranked candidate is used as evidence: a plain "read X" names one specific document.
        tools.push('readFile');
        const result = await answerFromEvidence(
          { intent: 'read', confidence: 1, rawQuery: userInput },
          userInput,
          files,
          context,
          ai,
          1,
        );
        if (result.message === INSUFFICIENT_EVIDENCE_MESSAGE) {
          return {
            message: `I found ${plural(files.length, 'matching file')}, but none of the top ones contain readable text (they may be scanned images).`,
            toolsExecuted: tools,
            files: files.slice(0, 3),
          };
        }
        return {
          message: result.message,
          toolsExecuted: tools,
          files: result.files,
          plan: { intent: 'DIRECT_READ', sourceLabel: result.sourceLabel, citations: result.citations },
        };
      }
    }
  } catch (err: any) {
    return { message: `I couldn't complete that: ${err?.message || String(err)}`, toolsExecuted: tools };
  }
}
