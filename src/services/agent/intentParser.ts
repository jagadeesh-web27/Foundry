// Type definitions for parsed intent
export type ParsedIntentType =
  | 'SEARCH_FILES'
  | 'SEARCH_FOLDERS'
  | 'GET_SYSTEM_INFO'
  | 'GET_APP_VERSION'
  | 'MOST_RECENT_FILE'
  | 'MOST_RECENT_FOLDER'
  | 'COUNT_FILES'
  | 'COUNT_FOLDERS'
  | 'OPEN_FILE'
  | 'OPEN_FOLDER'
  | 'REVEAL_FILE'
  | 'REVEAL_FOLDER'
  | 'READ_FILE'
  | 'GENERAL_QUERY'
  | 'CONCEPTUAL_FILE_QUERY';

export interface ParsedPlan {
  intent: ParsedIntentType;
  keywords: string[];
  extension?: string;
  targetObject?: 'FILE' | 'FOLDER' | 'SYSTEM' | 'VIDEO' | 'Document' | 'Image' | 'Video' | 'Audio' | 'Spreadsheet' | 'Presentation' | 'Code' | 'Archive' | 'Other';
  temporalConstraint?: {
    label: string;
    after: string; // ISO date string
    before: string; // ISO date string
    dateField: 'created' | 'modified' | 'accessed';
  };
  conceptualQueryType?: 'junk' | 'temporary' | 'large' | 'duplicate' | 'old' | 'recent';
  conceptualQueryDescription?: string;
  sortBy?: 'modifiedAt' | 'createdAt' | 'size' | 'accessedAt';
  sortOrder?: 'asc' | 'desc';
  isScreenRecording?: boolean;
  semanticTopics?: string[];
  // For MOST_RECENT_FILE/FOLDER
  limit?: number;
  // For COUNT
  count?: number;
  // For OPEN/REVEAL
  path?: string;
  // For READ_FILE
  fileId?: string;
  action?: string;
}

/**
 * Parses user intent into a structured plan
 */
export function parseUserIntent(query: string): ParsedPlan {
  if (!query || !query.trim()) {
    return {
      intent: 'SEARCH_FILES',
      keywords: [],
    };
  }

  const lower = query.toLowerCase().trim();
  const plan: ParsedPlan = {
    intent: 'SEARCH_FILES', // default
    keywords: [],
  };

  // 1. Check for general knowledge queries (highest priority)
  if (isGeneralKnowledgeQuery(lower)) {
    plan.intent = 'GENERAL_QUERY';
    return plan;
  }

  // 2. Check for conceptual file queries
  const conceptual = isConceptualFileQuery(lower);
  if (conceptual) {
    plan.intent = 'CONCEPTUAL_FILE_QUERY';
    plan.conceptualQueryType = conceptual.type;
    plan.conceptualQueryDescription = conceptual.description;
    return plan;
  }

  // 3. System Information Queries
  if (
    /\b(system\s+info|computer\s+info|specs?|hardware|ram|cpu|disk\s+space|storage)\b/i.test(
      lower
    )
  ) {
    plan.intent = 'GET_SYSTEM_INFO';
    plan.targetObject = 'SYSTEM';
    return plan;
  }

  // 4. App Version Queries
  if (/\b(app\s+version|version\s+number|build\s+number)\b/i.test(lower)) {
    plan.intent = 'GET_APP_VERSION';
    return plan;
  }

  // 5. Determine target object type
  // Check for specific file types first
  const specificFileType = detectFileTypeFromQuery(lower);
  if (specificFileType) {
    plan.targetObject = specificFileType as any; // Cast to any to avoid type issues
  } else if (/\bfolder\b/i.test(lower) && !/\b(file|document)\b/i.test(lower)) {
    plan.targetObject = 'FOLDER';
  } else if (
    /\b(file|document|pdf|doc|jpg|png|mp4|etc)(s|es)?\b/i.test(lower)
  ) {
    plan.targetObject = 'FILE';
  }

  // 6. Detect file extension from keywords
  const extensionFromKeyword = detectExtensionFromKeyword(lower);
  if (extensionFromKeyword) {
    plan.extension = extensionFromKeyword;
  }

  // 7. Temporal Condition Detection
  let temporalConstraint: ParsedPlan['temporalConstraint'] = undefined;
  const isCreated = /\b(created|added|downloaded|new)\b/i.test(lower);
  const isModified = /\b(modified|work(?:ed)?\s+on|opened|edited|updated|changed)\b/i.test(lower);
  const isAccessed = /\b(accessed|opened|read|viewed)\b/i.test(lower);

  // Determine date field based on what's being asked about
  let dateField: 'created' | 'modified' | 'accessed' = 'modified'; // default

  if (isCreated) {
    dateField = 'created';
  } else if (isModified) {
    dateField = 'modified';
  } else if (isAccessed) {
    dateField = 'accessed';
  } else {
    // Default based on target object
    dateField = plan.targetObject === 'FOLDER' ? 'created' : 'modified';
  }

  if (/\btoday\b/i.test(lower)) {
    const b = getTodayBounds();
    temporalConstraint = { label: 'today', after: b.start, before: b.end, dateField };
  } else if (/\byesterday\b/i.test(lower)) {
    const b = getYesterdayBounds();
    temporalConstraint = { label: 'yesterday', after: b.start, before: b.end, dateField };
  } else if (/\blast\s+week\b/i.test(lower)) {
    const b = getLastWeekBounds();
    temporalConstraint = { label: 'last week', after: b.start, before: b.end, dateField };
  } else if (/\bthis\s+week\b/i.test(lower)) {
    const b = getThisWeekBounds();
    temporalConstraint = { label: 'this week', after: b.start, before: b.end, dateField };
  } else if (/\bthis\s+month\b/i.test(lower)) {
    const b = getThisMonthBounds();
    temporalConstraint = { label: 'this month', after: b.start, before: b.end, dateField };
  } else if (/\blast\s+month\b/i.test(lower)) {
    const b = getLastMonthBounds();
    temporalConstraint = { label: 'last month', after: b.start, before: b.end, dateField };
  } else if (/\brecently\b/i.test(lower)) {
    const b = getRecentBounds();
    temporalConstraint = { label: 'recently', after: b.start, before: b.end, dateField };
  } else {
    // "N days ago"
    const daysAgoMatch = lower.match(/(\d+)\s+days?\s+ago/i);
    if (daysAgoMatch) {
      const days = parseInt(daysAgoMatch[1], 10);
      const b = getDaysAgoBounds(days);
      temporalConstraint = { label: `${days} day${days > 1 ? 's' : ''} ago`, after: b.start, before: b.end, dateField };
    }

    // Explicit date: e.g. "September 15" or "Sep 15" (support any month)
    if (!temporalConstraint) {
      const months: Record<string, number> = {
        january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
        april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
        august: 7, aug: 7, september: 8, sep: 8, sept: 8,
        october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
      };
      const dateMatch = lower.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})\b/i);
      const dateMatch2 = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/i);
      const dm = dateMatch || dateMatch2;
      if (dm) {
        const monthStr = (dateMatch ? dm[1] : dm[2]).toLowerCase();
        const day = parseInt(dateMatch ? dm[2] : dm[1], 10);
        const month = months[monthStr];
        if (month !== undefined) {
          const year = new Date().getFullYear();
          const start = new Date(year, month, day, 0, 0, 0, 0);
          const end = new Date(year, month, day, 23, 59, 59, 999);
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          temporalConstraint = { label: `${monthNames[month]} ${day}`, after: start.toISOString(), before: end.toISOString(), dateField };
        }
      }
    }
  }

  if (temporalConstraint) {
    plan.temporalConstraint = temporalConstraint;
  }

  // 8. Screen Recording Detection
  if (/\b(screen\s+recording|screen\s+capture)(s|es)?\b/i.test(lower)) {
    plan.isScreenRecording = true;
    // If we detected screen recording but didn't set a specific targetObject, set it to VIDEO
    if (!plan.targetObject || plan.targetObject === 'FILE') {
      plan.targetObject = 'VIDEO';
    }
  }

  // 9. Sorting
  let sortBy: ParsedPlan['sortBy'] = undefined;
  let sortOrder: ParsedPlan['sortOrder'] = undefined;

  // Check for access-time requests (opened/accessed/read/viewed)
  const isAccessTimeRequest = /\b(last\s+(opened|accessed|read|viewed)|recently\s+(opened|accessed|read|viewed)|lastly\s+open|which.*open|which.*accessed)\b/i.test(lower);
  // Check for modification-time requests (modified/edited/changed/updated)
  const isModificationTimeRequest = /\b(last\s+(modified|edited|changed|updated)|recently\s+(modified|edited|changed|updated)|last\s+worked\s+on)\b/i.test(lower);
  // Check for creation-time requests (created/added/new)
  const isCreationTimeRequest = /\b(last\s+(created|added|new)|recently\s+(created|added|new))\b/i.test(lower);

  if (isAccessTimeRequest) {
    sortBy = 'accessedAt';
    sortOrder = 'desc';
  } else if (isModificationTimeRequest) {
    sortBy = 'modifiedAt';
    sortOrder = 'desc';
  } else if (isCreationTimeRequest) {
    sortBy = 'createdAt';
    sortOrder = 'desc';
  } else if (/\b(latest|newest)\b/i.test(lower)) {
    sortBy = 'createdAt';
    sortOrder = 'desc';
  } else if (/\b(oldest|earliest)\b/i.test(lower)) {
    sortBy = 'createdAt';
    sortOrder = 'asc';
  } else if (/\b(largest|biggest|most\s+space)\b/i.test(lower)) {
    sortBy = 'size';
    sortOrder = 'desc';
  }

  if (sortBy) {
    plan.sortBy = sortBy;
    plan.sortOrder = sortOrder || 'desc';
  }

  // 10. Intent Detection based on keywords and context
  // Most Recent File/Folder
  if (
    /\b(last|latest|most\s+recent)\b/.test(lower) &&
    (/\b(file|document)\b/.test(lower) || plan.targetObject === 'FILE') &&
    !isAccessTimeRequest && // Already handled above
    !isModificationTimeRequest && // Already handled above
    !isCreationTimeRequest // Already handled above
  ) {
    plan.intent = 'MOST_RECENT_FILE';
    plan.limit = 1;
  } else if (
    /\b(last|latest|most\s+recent)\b/.test(lower) &&
    (/\bfolder\b/.test(lower) || plan.targetObject === 'FOLDER') &&
    !isAccessTimeRequest &&
    !isModificationTimeRequest &&
    !isCreationTimeRequest
  ) {
    plan.intent = 'MOST_RECENT_FOLDER';
    plan.limit = 1;
  }

  // Count intents
  if (/\b(count|how\s+many|number\s+of)\b/i.test(lower)) {
    if (plan.targetObject === 'FOLDER') {
      plan.intent = 'COUNT_FOLDERS';
    } else {
      plan.intent = 'COUNT_FILES';
    }
  }

  // Open intents
  if (/\b(open|launch|start)\b/i.test(lower)) {
    if (plan.targetObject === 'FOLDER') {
      plan.intent = 'OPEN_FOLDER';
    } else {
      plan.intent = 'OPEN_FILE';
    }
  }

  // Reveal intents
  if (/\b(reveal|show\s+in\s+folder|locate|find\s+location)\b/i.test(lower)) {
    if (plan.targetObject === 'FOLDER') {
      plan.intent = 'REVEAL_FOLDER';
    } else {
      plan.intent = 'REVEAL_FILE';
    }
  }

  // Read intents
  if (/\b(read|view|see|open\s+content)\b/i.test(lower)) {
    plan.intent = 'READ_FILE';
  }

  // Detect summarize action
  if (/\b(summarize|summary)\b/i.test(lower)) {
    plan.action = 'SUMMARIZE';
  }

  // 11. Semantic Topic Detection (basic implementation)
  plan.semanticTopics = [];
  if (/\b(resume|cv|currículum vitae)\b/i.test(lower)) {
    plan.semanticTopics.push('employment');
  }
  if (/\b(photo|picture|image|vacation|holiday|travel|family|wedding|birthday)\b/i.test(lower)) {
    plan.semanticTopics.push('personal');
  }
  if (/\b(project|work|business|meeting|presentation|report)\b/i.test(lower)) {
    plan.semanticTopics.push('work');
  }
  if (/\b(screenshot|capture)\b/i.test(lower)) {
    plan.semanticTopics.push('screenshot');
  }

  // 12. Extract keywords (remove common words and extract meaningful terms)
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'i', 'you', 'we', 'they',
    'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their', 'me', 'him', 'her', 'us', 'them',
    'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'all', 'any', 'some', 'no', 'not',
    'give', 'get', 'find', 'show', 'list', 'tell', 'me', 'please', 'thanks', 'thank', 'yes', 'no',
    'file', 'files', 'folder', 'folders', 'document', 'documents',
    'there',
    'created',
    'today' // Added to fix keyword filtering for temporal constraints
  ]);

  // Extract words that are at least 2 characters and not in stop words
  const words = lower.match(/\b[a-z]{2,}\b/g) || [];
  plan.keywords = words.filter(word => !stopWords.has(word));

  // If we still have the default intent but detected a more specific targetObject, adjust intent
  if (plan.intent === 'SEARCH_FILES' && plan.targetObject) {
    if (plan.targetObject === 'FOLDER') {
      plan.intent = 'SEARCH_FOLDERS';
    } else if (plan.targetObject === 'SYSTEM') {
      // SYSTEM intent would have been caught earlier
    }
    // For specific file types like Document, Video, etc., we still use SEARCH_FILES
    // but the targetObject helps the tool know what to look for
  }

  return plan;
}

/**
 * Determines if a query is a general knowledge question
 */
function isGeneralKnowledgeQuery(query: string): boolean {
  const generalPatterns = [
    /\b(what\s+is|what\s+are|what\s+was|what\s+were)\b/i,
    /\b(how\s+does|how\s+do|how\s+did|how\s+to)\b/i,
    /\b(explain|explanation|describe|description)\b/i,
    /\b(why\s+is|why\s+are|why\s+was|why\s+were)\b/i,
    /\b(tell\s+me\s+about|info\s+on|information\s+about)\b/i,
    /\b(history\s+of|origin\s+of|meaning\s+of)\b/i,
    /\b(who\s+is|who\s+are|who\s+was|who\s+were)\b/i,
    /\b(when\s+is|when\s+are|when\s+was|when\s+were)\b/i,
    /\b(where\s+is|where\s+are|where\s+was|where\s+were)\b/i,
    /\b(define|definition)\b/i,
    /\b(is\s+it\s+true\s+that|is\s+it\s+correct\s+that)\b/i,
    /\b(what\s+does\s+\w+\s+mean)\b/i,
    /\b(how\s+much\s+is|how\s+many\s+are)\b/i,
    /\b(convert|conversion|calculate|calculation)\b/i,
    /\b(weather\s+|temperature\s+|forecast\s+)/i,
    /\b(stock\s+price|share\s+price|market\s+)/i,
    /\b(sports\s+score|game\s+result|match\s+)/i
  ];

  return generalPatterns.some(pattern => pattern.test(query));
}

/**
 * Determines if a query is a conceptual file query
 */
interface ConceptualFileQueryResult {
  type: 'junk' | 'temporary' | 'large' | 'duplicate' | 'old' | 'recent';
  description: string;
}

function isConceptualFileQuery(query: string): ConceptualFileQueryResult | false {
  const conceptualPatterns: Array<{
    pattern: RegExp;
    type: ConceptualFileQueryResult['type'];
    description: string;
  }> = [
    { pattern: /\b(junk\s+files?|trash\s+files?|garbage\s+files?|worthless\s+files?)\b/i, type: 'junk', description: 'Junk or worthless files' },
    { pattern: /\b(temporary\s+files?|temp\s+files?|cache\s+files?)\b/i, type: 'temporary', description: 'Temporary or cache files' },
    { pattern: /\b(large\s+files?|big\s+files?|huge\s+files?|size\s+of\s+files?)\b/i, type: 'large', description: 'Large files by size' },
    { pattern: /\b(duplicate\s+files?|copies\s+of\s+files?|redundant\s+files?)\b/i, type: 'duplicate', description: 'Duplicate files' },
    { pattern: /\b(old\s+files?|aged\s+files?|legacy\s+files?)\b/i, type: 'old', description: 'Old files' },
    { pattern: /\b(recent\s+files?|new\s+files?|latest\s+files?)\b/i, type: 'recent', description: 'Recent files' }
  ];

  for (const { pattern, type, description } of conceptualPatterns) {
    if (pattern.test(query)) {
      return { type, description };
    }
  }

  return false;
}

/**
 * Detects file extension from keywords in the query
 */
function detectExtensionFromKeyword(query: string): string | undefined {
  const extensionMap: Record<string, string> = {
    // Documents
    'pdf': 'pdf',
    'doc': 'doc',
    'docx': 'docx',
    'txt': 'txt',
    'rtf': 'rtf',
    'odt': 'odt',
    'pages': 'pages',
    'md': 'md',
    'markdown': 'md',

    // Spreadsheets
    'excel': 'xlsx',
    'xls': 'xls',
    'xlsx': 'xlsx',
    'csv': 'csv',
    'numbers': 'numbers',

    // Presentations
    'powerpoint': 'pptx',
    'ppt': 'ppt',
    'pptx': 'pptx',
    'key': 'key',

    // Images
    'jpg': 'jpg',
    'jpeg': 'jpg',
    'png': 'png',
    'gif': 'gif',
    'bmp': 'bmp',
    'tiff': 'tiff',
    'webp': 'webp',
    'svg': 'svg',
    'raw': 'raw',

    // Videos
    'mp4': 'mp4',
    'avi': 'avi',
    'mov': 'mov',
    'wmv': 'wmv',
    'flv': 'flv',
    'mkv': 'mkv',
    'webm': 'webm',
    'm4v': 'm4v',

    // Audio
    'mp3': 'mp3',
    'wav': 'wav',
    'flac': 'flac',
    'aac': 'aac',
    'ogg': 'ogg',
    'm4a': 'm4a',

    // Archives
    'zip': 'zip',
    'rar': 'rar',
    '7z': '7z',
    'tar': 'tar',
    'gz': 'gz',

    // Code
    'js': 'js',
    'javascript': 'js',
    'ts': 'ts',
    'typescript': 'ts',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'py': 'py',
    'python': 'py',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'cs',
    'php': 'php',
    'rb': 'rb',
    'go': 'go',
    'rs': 'rs',
    'swift': 'swift',
    'kotlin': 'kt',
    'kt': 'kt'
  };

  // Check for explicit mentions like "pdf files", "excel documents", etc.
  for (const [keyword, extension] of Object.entries(extensionMap)) {
    if (new RegExp(`\\b${keyword}(?:s|es)?(?:\\s+(?:file|document|files?|documents?))?\\b`, 'i').test(query)) {
      return extension;
    }
  }

  return undefined;
}

/**
 * Detects specific file type (Document, Video, etc.) from query keywords
 */
function detectFileTypeFromQuery(query: string): string | undefined {
  // Map query terms to file types (simplified version without importing ComputerFileType)
  const typeMap: Record<string, string> = {
    // Documents
    'document': 'Document',
    'doc': 'Document',
    'pdf': 'Document',
    'txt': 'Document',
    'rtf': 'Document',

    // Spreadsheets
    'spreadsheet': 'Spreadsheet',
    'excel': 'Spreadsheet',
    'xls': 'Spreadsheet',
    'xlsx': 'Spreadsheet',
    'csv': 'Spreadsheet',
    'numbers': 'Spreadsheet',

    // Presentations
    'presentation': 'Presentation',
    'powerpoint': 'Presentation',
    'ppt': 'Presentation',
    'pptx': 'Presentation',
    'key': 'Presentation',

    // Images
    'image': 'Image',
    'photo': 'Image',
    'picture': 'Image',
    'jpg': 'Image',
    'jpeg': 'Image',
    'png': 'Image',
    'gif': 'Image',
    'bmp': 'Bmp',
    'tiff': 'Tiff',
    'webp': 'Webp',
    'svg': 'Svg',
    'raw': 'Raw',

    // Videos
    'video': 'Video',
    'movie': 'Video',
    'mp4': 'Video',
    'avi': 'Avi',
    'mov': 'Mov',
    'wmv': 'Wmv',
    'flv': 'Flv',
    'mkv': 'Mkv',
    'webm': 'Webm',
    'm4v': 'M4v',

    // Audio
    'audio': 'Audio',
    'sound': 'Sound',
    'music': 'Music',
    'mp3': 'Mp3',
    'wav': 'Wav',
    'flac': 'Flac',
    'aac': 'Aac',
    'ogg': 'Ogg',
    'm4a': 'M4a',

    // Archives
    'archive': 'Archive',
    'zip': 'Zip',
    'rar': 'Rar',
    '7z': '7z',
    'tar': 'Tar',
    'gz': 'Gz',

    // Code
    'code': 'Code',
    'source': 'Source',
    'program': 'Program',
    'js': 'Js',
    'javascript': 'Javascript',
    'ts': 'Ts',
    'typescript': 'Typescript',
    'html': 'Html',
    'css': 'Css',
    'py': 'Py',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'Cpp',
    'c': 'C',
    'cs': 'Cs',
    'php': 'Php',
    'rb': 'Rb',
    'go': 'Go',
    'rs': 'Rs',
    'swift': 'Swift',
    'kotlin': 'Kotlin'
  };

  // Check for explicit mentions of file types (handle plurals)
  for (const [keyword, type] of Object.entries(typeMap)) {
    if (new RegExp(`\\b${keyword}(?:s|es)?\\b`, 'i').test(query)) {
      return type.toUpperCase();
    }
  }

  return undefined;
}

/**
 * Helper functions for date range calculations
 */
function getTodayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getYesterdayBounds() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getLastWeekBounds() {
  const now = new Date();
  now.setDate(now.getDate() - now.getDay() - 7); // Last Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  now.setDate(now.getDate() + 6); // Last Sunday
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getThisWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day; // Monday of this week
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + 6, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getThisMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getLastMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getRecentBounds() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  return { start: twentyFourHoursAgo.toISOString(), end: now.toISOString() };
}

function getDaysAgoBounds(days: number) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  const start = new Date(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate(), 0, 0, 0, 0);
  const end = new Date(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}