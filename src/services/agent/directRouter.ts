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
  | { kind: 'search'; args: FileSearchArgs; label: string; showAll: boolean }
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
  /\b(files?|folders?|directories|docs?|documents?|pdfs?|docx?|xlsx?|csv|excel|word|powerpoint|pptx?|slides?|presentations?|spreadsheets?|photos?|pictures?|images?|screenshots?|videos?|recordings?|music|songs?|audio|resumes?|cv|invoices?|reports?|notes?)\b/i;
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
  'images', 'video', 'videos', 'music', 'audio', 'song', 'songs', 'screenshot', 'screenshots', 'recording', 'recordings',
  'related', 'regarding', 'concerning', 'containing', 'mentioning', 'mention', 'mentions', 'contain', 'contains',
  'has', 'have', 'had', 'did', 'last', 'some', 'by', 'at', 'or',
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
  return { label: 'files' };
}

export function extractQuery(text: string, dropTimeWords = false): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_.-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t) && !(dropTimeWords && (TIME_WORDS.has(t) || /^\d{1,3}$/.test(t))))
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
 * ("what is RAM", "explain how wifi works"). Personal phrasing ("my", "do I have") is not general.
 */
export function looksLikeGeneralKnowledge(text: string): boolean {
  const t = text.trim().toLowerCase();
  const starts = /^(?:what is|what are|what's|explain|who is|who was|why is|why do|how do|how does|how to|write|code|tell me about|translate|convert|define|meaning of)\b/.test(t);
  const personal = /\b(my|mine|do i have|i have|on my|this (computer|laptop|phone|device))\b/.test(t);
  return starts && !personal;
}

// Questions about Foundry's own task / goal / calendar features are not file searches.
const APP_DOMAIN = /\b(tasks?|todos?|goals?|calendar|meetings?|emails?|messages?|schedule|commitments?|follow-?ups?|pending|today|tomorrow|agenda)\b/;

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
  const query = extractQuery(text, !!time);
  const args: FileSearchArgs = { extension: type.extension, fileTypes: type.fileTypes, query: query || undefined };
  if (query && CONTENT_INTENT.test(text)) args.content = true;
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
  }
  const base = query ? (args.content ? `${type.label} about "${query}"` : `${type.label} matching "${query}"`) : type.label;
  const label = time ? `${base} ${time.label}` : base;

  if (/\b(how many|count|number of)\b/.test(text)) {
    return { kind: 'count', args, label };
  }
  if (READ_VERB.test(text) && (query || type.extension || type.fileTypes)) {
    return { kind: 'read', args, label: query || type.label };
  }
  if (SEARCH_VERB.test(text) || /\bmy\b/.test(text) || time) {
    if (!query && !type.extension && !type.fileTypes && !time) return null;
    const showAll = /\b(all|every|list)\b/.test(text);
    return { kind: 'search', args, label, showAll };
  }
  return null;
}

function plural(n: number, singular: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${singular}s`;
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
        return { message: `You have **${r.count}** ${route.label}.`, toolsExecuted: tools, plan: { intent: 'DIRECT_COUNT' } };
      }
      case 'search': {
        tools.push('searchFiles');
        const files = await searchWithFallback(route.args, context, route.showAll ? 50 : 25);
        if (files.length === 0) {
          return { message: `I couldn't find any ${route.label} on this device.`, toolsExecuted: tools, files: [], plan: { intent: 'DIRECT_SEARCH_NONE' } };
        }
        const shown = files.slice(0, route.showAll ? 20 : 5);
        const onlyMentions = !route.args.content && !!route.args.query && files.every((f) => f.matchIn === 'content');
        const n = files.length;
        const head = onlyMentions
          ? `I couldn't find a file named "${route.args.query}", but ${n === 1 ? '1 document mentions' : `${n} documents mention`} it${n > shown.length ? ` (showing ${shown.length})` : ''}:`
          : n === 1
            ? `I found 1 file for ${route.label}:`
            : `I found ${n} ${route.label}. Showing the top ${shown.length}:`;
        return { message: head, toolsExecuted: tools, files: shown, plan: { intent: 'DIRECT_SEARCH' } };
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
