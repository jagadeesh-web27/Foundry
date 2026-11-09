/**
 * Comparative natural-language file search ("give me the larger video", "which document uses the
 * most storage?", "show the 5 smallest PDFs in Downloads"). Every test asserts the structured plan
 * or the exact arguments that reach an adapter — never only the final text — per the requirement
 * that comparison words are a sort instruction, never a literal filename query.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  routeQuery,
  runDirectRoute,
  detectComparison,
  detectLimit,
  detectScope,
  buildComparisonRoute,
} from '@/services/agent/directRouter';
import { detectComparisonFollowUp } from '@/services/agent/referenceResolver';
import { computerTools, AgentContext } from '@/services/agent/tools';
import { deviceService } from '@/services/device/deviceService';
import { agentRunner } from '@/services/agent/agentRunner';
import { IndexedFile } from '@/types/file';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';

const now = new Date().toISOString();
const blankContext: AgentContext = {
  indexedFiles: [],
  indexedFolders: [],
  openFile: vi.fn().mockResolvedValue(true),
  revealFile: vi.fn().mockResolvedValue(true),
};

describe('directRouter: comparison word -> structured sort instruction (not a filename query)', () => {
  it.each([
    ['give me the larger video', { fileTypes: ['Video'], sortBy: 'size', sortOrder: 'desc', limit: 1 }],
    ['give me the largest video', { fileTypes: ['Video'], sortBy: 'size', sortOrder: 'desc', limit: 1 }],
    ['which video takes the most space?', { fileTypes: ['Video'], sortBy: 'size', sortOrder: 'desc', limit: 1 }],
    ['what is my biggest file?', { sortBy: 'size', sortOrder: 'desc', limit: 1 }],
    ['show the biggest PDF', { extension: 'pdf', sortBy: 'size', sortOrder: 'desc', limit: 1 }],
    ['which document uses the most storage?', { sortBy: 'size', sortOrder: 'desc', limit: 1 }],
    ['show the smallest image', { fileTypes: ['Image'], sortBy: 'size', sortOrder: 'asc', limit: 1 }],
  ] as const)('"%s" produces the correct structured searchFiles args', (input, expected) => {
    const route = routeQuery(input);
    expect(route?.kind).toBe('search');
    expect((route as any).args).toMatchObject(expected);
    // Every case above asks about exactly one file: never a literal filename query.
    expect((route as any).args.query).toBeUndefined();
  });

  it('"find large videos" sorts by size desc without collapsing to a single result', () => {
    const route = routeQuery('find large videos') as any;
    expect(route.kind).toBe('search');
    expect(route.args.fileTypes).toEqual(['Video']);
    expect(route.args.sortBy).toBe('size');
    expect(route.args.sortOrder).toBe('desc');
    expect(route.args.limit).toBeUndefined();
    expect(route.args.query).toBeUndefined();
  });

  it('"what are the 5 largest files in Downloads?" extracts an explicit limit and folder scope', () => {
    const route = routeQuery('what are the 5 largest files in Downloads?') as any;
    expect(route.kind).toBe('search');
    expect(route.args.limit).toBe(5);
    expect(route.args.scopePath).toBe('Downloads');
    expect(route.args.sortBy).toBe('size');
    expect(route.args.sortOrder).toBe('desc');
    expect(route.args.query).toBeUndefined();
  });

  it('"show the 5 smallest PDFs in Downloads" extracts extension, limit, scope and ascending sort', () => {
    const route = routeQuery('show the 5 smallest PDFs in Downloads') as any;
    expect(route.kind).toBe('search');
    expect(route.args.extension).toBe('pdf');
    expect(route.args.limit).toBe(5);
    expect(route.args.scopePath).toBe('Downloads');
    expect(route.args.sortOrder).toBe('asc');
    expect(route.args.query).toBeUndefined();
  });

  it('"how many videos are in Movies" is a scoped count, not a comparison', () => {
    const route = routeQuery('how many videos are in Movies') as any;
    expect(route.kind).toBe('count');
    expect(route.args.fileTypes).toEqual(['Video']);
    expect(route.args.scopePath).toBe('Movies');
  });

  it.each([
    ['largest mp4', 'mp4'],
    ['largest xlsx', 'xlsx'],
    ['smallest mkv', 'mkv'],
  ])('arbitrary extension query "%s" filters by extension, not a filename query', (input, ext) => {
    const route = routeQuery(input) as any;
    expect(route.kind).toBe('search');
    expect(route.args.extension).toBe(ext);
    expect(route.args.query).toBeUndefined();
    expect(route.args.sortBy).toBe('size');
  });

  it('detectComparison/detectLimit/detectScope are pure and reusable outside routeQuery', () => {
    expect(detectComparison('the smallest photo')).toEqual({ comparison: 'smallest', sortBy: 'size', sortOrder: 'asc' });
    expect(detectComparison('a regular file')).toBeNull();
    expect(detectLimit('top 3 largest', detectComparison('top 3 largest'))).toBe(3);
    expect(detectScope('files from DCIM')).toBe('DCIM');
    expect(detectScope('files on my phone')).toBeUndefined();
  });
});

describe('runDirectRoute: comparison search uses the real returned file metadata', () => {
  const files: IndexedFile[] = [
    { id: '1', path: 'C:\\Videos\\small.mp4', name: 'small.mp4', extension: 'mp4', size: 1_000_000, createdAt: now, modifiedAt: now, fileType: 'Video', indexedAt: now, status: 'indexed' },
    { id: '2', path: 'C:\\Videos\\big.mp4', name: 'big.mp4', extension: 'mp4', size: 90_000_000, createdAt: now, modifiedAt: now, fileType: 'Video', indexedAt: now, status: 'indexed' },
    { id: '3', path: 'C:\\Videos\\mid.mp4', name: 'mid.mp4', extension: 'mp4', size: 40_000_000, createdAt: now, modifiedAt: now, fileType: 'Video', indexedAt: now, status: 'indexed' },
  ];
  const context: AgentContext = { ...blankContext, indexedFiles: files };

  it('answers with the single largest file by real size, never a guess', async () => {
    const route = routeQuery('give me the largest video')!;
    const result = await runDirectRoute(route, 'give me the largest video', context);
    expect(result.files?.length).toBe(1);
    expect(result.files![0].name).toBe('big.mp4');
    expect(result.message).toContain('big.mp4');
    expect(result.message).toContain('largest');
  });

  it('answers with the single smallest file by real size', async () => {
    const route = routeQuery('show the smallest video')!;
    const result = await runDirectRoute(route, 'show the smallest video', context);
    expect(result.files?.length).toBe(1);
    expect(result.files![0].name).toBe('small.mp4');
    expect(result.message).toContain('smallest');
  });

  it('limit is applied after sorting, not before: top 2 largest are the two biggest files', async () => {
    const route = routeQuery('show the 2 largest videos')!;
    const result = await runDirectRoute(route, 'show the 2 largest videos', context);
    expect(result.files?.map((f) => f.name)).toEqual(['big.mp4', 'mid.mp4']);
  });

  it('a truthful no-results response when nothing matches, never a fabricated answer', async () => {
    const route = routeQuery('show the largest PDF')!;
    const result = await runDirectRoute(route, 'show the largest PDF', context);
    expect(result.files ?? []).toEqual([]);
    expect(result.message.toLowerCase()).toContain("couldn't find");
  });

  it('a tool failure is reported honestly, not claimed as a result', async () => {
    const failingContext: AgentContext = {
      ...context,
      // Non-Tauri test env already uses the IndexedDB path; force a thrown error from it.
      indexedFiles: undefined as any,
    };
    const brokenExecute = vi.spyOn(computerTools.searchFiles, 'execute').mockRejectedValueOnce(new Error('disk read error'));
    const route = routeQuery('give me the largest video')!;
    const result = await runDirectRoute(route, 'give me the largest video', failingContext);
    expect(result.files ?? []).toEqual([]);
    expect(result.message).toContain("couldn't complete");
    brokenExecute.mockRestore();
  });
});

describe('Fallback (IndexedDB) search path: comparison sort/limit applied consistently', () => {
  const files: IndexedFile[] = [
    { id: 'a', path: 'C:\\Docs\\report.pdf', name: 'report.pdf', extension: 'pdf', size: 500_000, createdAt: now, modifiedAt: now, fileType: 'Document', indexedAt: now, status: 'indexed' },
    { id: 'b', path: 'C:\\Docs\\slip.pdf', name: 'slip.pdf', extension: 'pdf', size: 2_000_000, createdAt: now, modifiedAt: now, fileType: 'Document', indexedAt: now, status: 'indexed' },
  ];
  const context: AgentContext = { ...blankContext, indexedFiles: files };

  it('searchFiles.execute sorts descending and ascending by real numeric size', async () => {
    const route = routeQuery('show the biggest PDF') as any;
    const desc = await computerTools.searchFiles.execute(route.args, context);
    expect(desc[0].name).toBe('slip.pdf');

    const routeAsc = routeQuery('show the smallest PDF') as any;
    const asc = await computerTools.searchFiles.execute(routeAsc.args, context);
    expect(asc[0].name).toBe('report.pdf');
  });
});

describe('Native adapter dispatch: sortBy/sortOrder/limit/fileTypes/scopePath reach the right adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // This suite runs under the default `node` vitest environment, where `window` is not a global;
    // computerService/deviceService both gate on `typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window`.
    (globalThis as any).window = { __TAURI_INTERNALS__: {} };
  });
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it('Windows/Rust path: computerService.searchFilesLive invokes search_files_live with the structured args', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { path: 'D:\\Movies\\big.mp4', name: 'big.mp4', extension: 'mp4', size: 90_000_000, file_type: 'Video' },
    ]);
    const route = routeQuery('give me the largest video') as any;
    const result = await computerTools.searchFiles.execute(route.args, blankContext);

    expect(result[0].name).toBe('big.mp4');
    expect(invoke).toHaveBeenCalledWith('search_files_live', expect.objectContaining({
      fileTypes: ['Video'],
      sortBy: 'size',
      sortOrder: 'desc',
      limit: 1,
    }));
  });

  it('Android path: the device adapter receives the same structured args, not the Windows invoke', async () => {
    const androidSearchFiles = vi.fn().mockResolvedValue([
      { path: '/sdcard/DCIM/small.jpg', name: 'small.jpg', extension: 'jpg', size: 100_000, fileType: 'Image', createdAt: now, modifiedAt: now },
    ]);
    vi.spyOn(deviceService, 'getAdapter').mockReturnValue({
      platform: 'android',
      filesystem: { searchFiles: androidSearchFiles },
    } as any);

    const route = routeQuery('show the smallest image') as any;
    const result = await computerTools.searchFiles.execute(route.args, blankContext);

    expect(result[0].name).toBe('small.jpg');
    expect(androidSearchFiles).toHaveBeenCalledWith(expect.objectContaining({
      fileTypes: ['Image'],
      sortBy: 'size',
      sortOrder: 'asc',
      limit: 1,
    }));
    expect(invoke).not.toHaveBeenCalledWith('search_files_live', expect.anything());
  });

  it('scopePath reaches the native adapter for a folder-scoped comparison query', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const route = routeQuery('show the 5 smallest PDFs in Downloads') as any;
    await computerTools.searchFiles.execute(route.args, blankContext);
    expect(invoke).toHaveBeenCalledWith('search_files_live', expect.objectContaining({
      scopePath: 'Downloads',
      extension: 'pdf',
      sortOrder: 'asc',
      limit: 5,
    }));
  });

  it('an empty native result is reported truthfully, not as a found file', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const route = routeQuery('give me the largest video')!;
    const result = await runDirectRoute(route, 'give me the largest video', blankContext);
    expect(result.files ?? []).toEqual([]);
    expect(result.message.toLowerCase()).toContain("couldn't find");
  });
});

describe('Conversation follow-up: "what about the smallest one?" redoes the comparison, not a re-index', () => {
  it('detects a comparison follow-up only when the previous turn was a real file search', () => {
    const lastSearchArgs = { fileTypes: ['Video'], sortBy: 'size' as const, sortOrder: 'desc' as const, limit: 1 };
    expect(detectComparisonFollowUp('what about the smallest one?', { lastFiles: [], lastSearchArgs })).toEqual({
      comparison: 'smallest', sortBy: 'size', sortOrder: 'asc',
    });
    expect(detectComparisonFollowUp('what about the smallest one?', undefined)).toBeNull();
    expect(detectComparisonFollowUp('what is React?', { lastFiles: [], lastSearchArgs })).toBeNull();
  });

  it('buildComparisonRoute reuses the previous file-type filter with the new sort direction', () => {
    const route = buildComparisonRoute({ fileTypes: ['Video'], sortBy: 'size', sortOrder: 'desc', limit: 1 }, { comparison: 'smallest', sortBy: 'size', sortOrder: 'asc' }, 'what about the smallest one?');
    expect(route).toMatchObject({ kind: 'search', comparison: 'smallest', args: { fileTypes: ['Video'], sortBy: 'size', sortOrder: 'asc', limit: 1 } });
  });

  it('end-to-end: agentRunner redoes the search for "what about the smallest one?"', async () => {
    const files: IndexedFile[] = [
      { id: '1', path: 'C:\\Videos\\small.mp4', name: 'small.mp4', extension: 'mp4', size: 1_000_000, createdAt: now, modifiedAt: now, fileType: 'Video', indexedAt: now, status: 'indexed' },
      { id: '2', path: 'C:\\Videos\\big.mp4', name: 'big.mp4', extension: 'mp4', size: 90_000_000, createdAt: now, modifiedAt: now, fileType: 'Video', indexedAt: now, status: 'indexed' },
    ];
    const context: AgentContext = { ...blankContext, indexedFiles: files };
    const conversationContext = {
      lastFiles: [files[1]],
      lastSearchArgs: { fileTypes: ['Video'], sortBy: 'size' as const, sortOrder: 'desc' as const, limit: 1 },
    };

    const response = await agentRunner.run('what about the smallest one?', context, undefined, false, conversationContext);
    expect(response.files?.length).toBe(1);
    expect(response.files![0].name).toBe('small.mp4');
    expect(response.message).toContain('small.mp4');
    expect(response.message.toLowerCase()).toContain('smallest');
  });

  it('a plain, unrelated follow-up is not mistaken for a comparison redo', async () => {
    const conversationContext = { lastFiles: [], lastSearchArgs: undefined };
    const resolution = detectComparisonFollowUp('what is the capital of France?', conversationContext);
    expect(resolution).toBeNull();
  });
});
