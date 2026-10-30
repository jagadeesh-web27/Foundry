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

export interface FileSearchArgs {
  query?: string;
  extension?: string;
  fileTypes?: string[];
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

export function extractQuery(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_.-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
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
  if (!hasFileNoun && !namedItem && !READ_VERB.test(text)) return null;

  const type = detectFileType(text);
  const query = extractQuery(text);
  const args: FileSearchArgs = { extension: type.extension, fileTypes: type.fileTypes, query: query || undefined };

  if (/\b(how many|count|number of)\b/.test(text)) {
    return { kind: 'count', args, label: query ? `${type.label} matching "${query}"` : type.label };
  }
  if (READ_VERB.test(text) && (query || type.extension || type.fileTypes)) {
    return { kind: 'read', args, label: query || type.label };
  }
  if (SEARCH_VERB.test(text) || /\bmy\b/.test(text)) {
    if (!query && !type.extension && !type.fileTypes) return null;
    const showAll = /\b(all|every|list)\b/.test(text);
    return { kind: 'search', args, label: query ? `${type.label} matching "${query}"` : type.label, showAll };
  }
  return null;
}

function plural(n: number, singular: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${singular}s`;
}

function formatDisk(disks: any): string {
  const list = Array.isArray(disks) ? disks : [];
  if (list.length === 0) return "I couldn't read the disk information.";
  const rows = list.map(
    (d: any) =>
      `- **${d.drive}** ${d.totalFormatted} total, ${d.freeFormatted} free (${Math.round(d.percentageUsed)}% used)`,
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
  // Nothing matched the whole phrase: retry with the longest single word.
  if (files.length === 0 && args.query && args.query.includes(' ')) {
    const longest = args.query.split(' ').sort((a, b) => b.length - a.length)[0];
    files = await computerTools.searchFiles.execute({ ...payload, query: longest }, context);
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
        const head = files.length === 1 ? `I found 1 file for ${route.label}:` : `I found ${files.length} ${route.label}. Showing the top ${shown.length}:`;
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
        const top = files[0];
        tools.push('readFile');
        const text = String((await computerTools.readFile.execute({ path: top.path, maxChars: 6000 }, context)) || '').trim();
        if (!text) {
          return { message: `I found **${top.name}** but could not extract any readable text from it.`, toolsExecuted: tools, files: [top] };
        }
        if (!ai?.available) {
          return { message: `I found **${top.name}**. The on-device AI is not ready yet, so here is the beginning of the file:\n\n${text.slice(0, 600)}`, toolsExecuted: tools, files: [top] };
        }
        const summary = await ai.service.getProvider().chat([
          { role: 'system', content: 'You are Foundry. Summarize the document below for the user in a few short, factual sentences. Use only the text provided. Do not invent details.' },
          { role: 'user', content: `Document "${top.name}":\n---\n${text.slice(0, 3500)}\n---\nRequest: ${userInput}` },
        ]);
        return { message: summary.trim() || `I found **${top.name}**.`, toolsExecuted: tools, files: [top], plan: { intent: 'DIRECT_READ' } };
      }
    }
  } catch (err: any) {
    return { message: `I couldn't complete that: ${err?.message || String(err)}`, toolsExecuted: tools };
  }
}
