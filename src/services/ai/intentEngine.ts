import { ComputerFileType, IndexedFile } from '@/types/file';

export type UserIntent =
  | 'FILE_SEARCH'
  | 'IMAGE_SEARCH'
  | 'VIDEO_SEARCH'
  | 'AUDIO_SEARCH'
  | 'GENERAL_CHAT';

export interface StructuredQuery {
  raw: string;
  intent: UserIntent;
  targetType?: ComputerFileType;
  targetExtension?: string;
  dateFilter?: {
    type: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'exact';
    dateString?: string; // YYYY-MM-DD
  };
  keywords: string[];
  semanticKeywords: string[];
  qualityFilter?: boolean;
  isScreenRecording?: boolean;
  actionOpen?: boolean;
}

export function parseNaturalLanguageQuery(query: string): StructuredQuery {
  const lower = query.toLowerCase().trim();
  const words = lower.split(/[^a-zA-Z0-9_-]+/).filter(Boolean);

  let intent: UserIntent = 'FILE_SEARCH';
  let targetType: ComputerFileType | undefined = undefined;
  let targetExtension: string | undefined = undefined;
  let dateFilter: StructuredQuery['dateFilter'] = undefined;
  const keywords: string[] = [];
  const semanticKeywords: string[] = [];
  let qualityFilter = false;
  let isScreenRecording = false;
  const actionOpen = lower.startsWith('open ') || lower.includes('open file') || lower.includes('launch');

  // Extension detection
  if (lower.includes('pdf') || lower.includes('pdfs')) {
    targetExtension = 'pdf';
    targetType = 'Document';
  } else if (lower.includes('docx') || lower.includes('doc ') || lower.includes('word doc')) {
    targetExtension = 'docx';
    targetType = 'Document';
  } else if (lower.includes('xlsx') || lower.includes('excel') || lower.includes('spreadsheet') || lower.includes('csv')) {
    targetType = 'Spreadsheet';
  } else if (lower.includes('pptx') || lower.includes('presentation') || lower.includes('slides')) {
    targetType = 'Presentation';
  } else if (lower.includes('mp4') || lower.includes('video') || lower.includes('videos') || lower.includes('recording') || lower.includes('recordings')) {
    targetType = 'Video';
    intent = 'VIDEO_SEARCH';
  } else if (lower.includes('photo') || lower.includes('photos') || lower.includes('picture') || lower.includes('pictures') || lower.includes('image') || lower.includes('images')) {
    targetType = 'Image';
    intent = 'IMAGE_SEARCH';
  } else if (lower.includes('audio') || lower.includes('voice note') || lower.includes('voice recording') || lower.includes('sound') || lower.includes('music')) {
    targetType = 'Audio';
    intent = 'AUDIO_SEARCH';
  }

  // Quality ranking for photos: "good-looking photo", "profile photo"
  if (
    lower.includes('good-looking') ||
    lower.includes('good looking') ||
    lower.includes('profile photo') ||
    lower.includes('best photo') ||
    lower.includes('best picture') ||
    lower.includes('headshot')
  ) {
    qualityFilter = true;
    targetType = 'Image';
    intent = 'IMAGE_SEARCH';
  }

  // Screen recording detection
  if (lower.includes('screen record') || lower.includes('screen recording') || lower.includes('screen recordings')) {
    isScreenRecording = true;
    targetType = 'Video';
    intent = 'VIDEO_SEARCH';
  }

  // Date detection
  if (lower.includes('today') || lower.includes('added today') || lower.includes('created today') || lower.includes('modified today')) {
    dateFilter = { type: 'today' };
  } else if (lower.includes('yesterday')) {
    dateFilter = { type: 'yesterday' };
  } else if (lower.includes('last week')) {
    dateFilter = { type: 'last_week' };
  } else if (lower.includes('this week')) {
    dateFilter = { type: 'this_week' };
  } else if (lower.includes('this month')) {
    dateFilter = { type: 'this_month' };
  } else {
    // Check for explicit dates e.g. "september 15", "sep 15", "15th september", "2026-09-15"
    const months: Record<string, number> = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
      april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
      august: 8, aug: 8, september: 9, sep: 9, sept: 9,
      october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
    };
    const monthMatch = lower.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})\b/i);
    const monthMatch2 = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/i);
    const mm = monthMatch || monthMatch2;
    if (mm) {
      const monthStr = (monthMatch ? mm[1] : mm[2]).toLowerCase();
      const day = parseInt(monthMatch ? mm[2] : mm[1], 10);
      const monthNum = months[monthStr];
      if (monthNum !== undefined) {
        const year = new Date().getFullYear();
        const dayStr = day.toString().padStart(2, '0');
        const monStr = monthNum.toString().padStart(2, '0');
        dateFilter = { type: 'exact', dateString: `${year}-${monStr}-${dayStr}` };
      }
    }
  }

  // Topic & Semantic Expansion
  if (lower.includes('resume') || lower.includes('cv')) {
    keywords.push('resume', 'cv');
    semanticKeywords.push('biodata', 'profile', 'curriculum', 'vitae');
  }
  if (lower.includes('offer letter') || lower.includes('offer')) {
    keywords.push('offer');
    semanticKeywords.push('appointment', 'contract', 'employment');
  }
  if (lower.includes('joining letter') || lower.includes('joining')) {
    keywords.push('joining');
    semanticKeywords.push('onboarding', 'acceptance', 'signed');
  }
  if (lower.includes('certificate') || lower.includes('certificates') || lower.includes('degree') || lower.includes('marksheet')) {
    keywords.push('certificate', 'degree', 'marksheet', 'diploma');
    semanticKeywords.push('graduation', 'academic', 'qualification');
  }
  if (lower.includes('mca')) {
    keywords.push('mca');
    semanticKeywords.push('master', 'computer', 'applications', 'university');
  }
  if (lower.includes('tax') || lower.includes('form 16') || lower.includes('form16') || lower.includes('income tax')) {
    keywords.push('tax', 'form16', 'computation', 'itr', 'financial');
    semanticKeywords.push('salary', 'deduction', 'returns');
  }
  if (lower.includes('marriage') || lower.includes('wedding') || lower.includes('reception')) {
    keywords.push('marriage', 'wedding', 'reception', 'ceremony');
    targetType = 'Image';
    intent = 'IMAGE_SEARCH';
  }
  if (lower.includes('mysore')) {
    keywords.push('mysore');
    semanticKeywords.push('palace', 'trip', 'karnataka');
  }
  if (lower.includes('trip') || lower.includes('travel') || lower.includes('tour')) {
    keywords.push('trip', 'travel', 'vacation');
  }
  if (lower.includes('bike') || lower.includes('motorcycle') || lower.includes('enfield') || lower.includes('ride')) {
    keywords.push('bike', 'enfield', 'motorcycle', 'ride');
  }
  if (lower.includes('accessibility') || lower.includes('wcag')) {
    keywords.push('accessibility', 'wcag');
  }

  // Add all other non-stop words
  const stopWords = new Set([
    'give', 'me', 'my', 'all', 'find', 'show', 'get', 'what', 'files', 'file',
    'the', 'a', 'an', 'is', 'did', 'i', 'for', 'of', 'in', 'on', 'from', 'to',
    'about', 'related', 'created', 'modified', 'added', 'downloaded', 'please',
  ]);

  for (const w of words) {
    if (!stopWords.has(w) && w.length > 2 && !keywords.includes(w)) {
      keywords.push(w);
    }
  }

  return {
    raw: query,
    intent,
    targetType,
    targetExtension,
    dateFilter,
    keywords,
    semanticKeywords,
    qualityFilter,
    isScreenRecording,
    actionOpen,
  };
}

export function searchIndexedFiles(
  files: IndexedFile[],
  query: StructuredQuery
): { matches: IndexedFile[]; explanation: string } {
  const scored = files.map((file) => {
    let score = 0;
    const lowerName = file.name.toLowerCase();
    const lowerPath = file.path.toLowerCase();

    // 1. File Type Match
    if (query.targetType) {
      if (file.fileType === query.targetType) {
        score += 5;
      } else {
        // Penalty if explicit type mismatch requested
        return { file, score: -10 };
      }
    }

    // 2. Extension Match
    if (query.targetExtension) {
      if (file.extension.toLowerCase() === query.targetExtension.toLowerCase()) {
        score += 8;
      } else {
        return { file, score: -10 };
      }
    }

    // 3. Screen recording
    if (query.isScreenRecording) {
      if (file.isScreenRecording) {
        score += 10;
      } else {
        return { file, score: -5 };
      }
    }

    // 4. Quality Ranking (for "good-looking photo of myself" / "profile photo")
    if (query.qualityFilter && file.fileType === 'Image') {
      score += (file.qualityScore ?? 0.5) * 10;
      if (lowerName.includes('profile') || lowerName.includes('headshot')) {
        score += 8;
      }
    }

    // 5. Date Matching
    if (query.dateFilter) {
      const fileDate = new Date(file.modifiedAt || file.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - fileDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (query.dateFilter.type === 'today') {
        if (diffDays <= 1.0 && fileDate.getDate() === now.getDate()) {
          score += 15;
        } else {
          return { file, score: -10 };
        }
      } else if (query.dateFilter.type === 'yesterday') {
        if (diffDays >= 0.8 && diffDays <= 2.2) {
          score += 15;
        } else {
          return { file, score: -10 };
        }
      } else if (query.dateFilter.type === 'last_week' || query.dateFilter.type === 'this_week') {
        if (diffDays <= 8.0) {
          score += 10;
        } else {
          return { file, score: -10 };
        }
      } else if (query.dateFilter.type === 'this_month') {
        if (diffDays <= 31.0 && fileDate.getMonth() === now.getMonth()) {
          score += 10;
        } else {
          return { file, score: -10 };
        }
      } else if (query.dateFilter.type === 'exact' && query.dateFilter.dateString) {
        const fileIso = fileDate.toISOString().slice(0, 10);
        if (fileIso === query.dateFilter.dateString || lowerName.includes(query.dateFilter.dateString)) {
          score += 20;
        } else {
          return { file, score: -10 };
        }
      }
    }

    // 6. Keywords in filename and path
    let matchedKeyword = false;
    for (const kw of query.keywords) {
      if (lowerName.includes(kw)) {
        score += 15;
        matchedKeyword = true;
      } else if (lowerPath.includes(kw)) {
        score += 5;
        matchedKeyword = true;
      }
    }

    // 7. Semantic keywords
    for (const skw of query.semanticKeywords) {
      if (lowerName.includes(skw)) {
        score += 8;
        matchedKeyword = true;
      }
    }

    // If query had explicit subject keywords (e.g. "resume", "marriage"), require a keyword match
    if (query.keywords.length > 0 && !matchedKeyword) {
      return { file, score: -10 };
    }

    return { file, score };
  });

  const matching = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.file);

  // Generate grounded natural summary
  let explanation = '';
  if (matching.length === 0) {
    explanation = `I searched your computer, but couldn't find files matching "${query.raw}".`;
  } else {
    const typeLabel = query.targetType ? `${query.targetType.toLowerCase()}s` : 'files';
    explanation = `I found ${matching.length} matching ${typeLabel} on your computer:`;
  }

  return { matches: matching, explanation };
}
