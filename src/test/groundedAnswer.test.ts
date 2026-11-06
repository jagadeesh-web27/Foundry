import { describe, it, expect, vi, afterEach } from 'vitest';
import { answerFromEvidence, stripInvalidCitations, sourceLabelFor, INSUFFICIENT_EVIDENCE_MESSAGE } from '@/services/agent/groundedAnswer';
import { computerTools, AgentContext } from '@/services/agent/tools';
import { AIService } from '@/services/ai/aiService';
import { IndexedFile } from '@/types/file';
import { QueryPlan } from '@/services/agent/queryPlanner';

function file(overrides: Partial<IndexedFile> = {}): IndexedFile {
  return {
    id: 'f1',
    path: 'C:\\Docs\\Resume.pdf',
    name: 'Resume.pdf',
    extension: 'pdf',
    size: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    fileType: 'Document',
    indexedAt: '2026-01-01T00:00:00.000Z',
    status: 'indexed',
    ...overrides,
  };
}

const plan: QueryPlan = { intent: 'summarize', confidence: 0.85, rawQuery: 'summarize my resume' };
const context = {} as AgentContext;

function mockAi(reply: string): { service: AIService; available: boolean } {
  return {
    service: { getProvider: () => ({ chat: async () => reply }) } as unknown as AIService,
    available: true,
  };
}

describe('groundedAnswer: answerFromEvidence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says so honestly when there are no candidates at all', async () => {
    const result = await answerFromEvidence(plan, 'summarize my resume', [], context, mockAi('irrelevant'));
    expect(result.message).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
    expect(result.citations).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it('skips candidates the index already knows have no usable text', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('should never be called');
    const candidates = [file({ extractionStatus: 'unsupported_type' }), file({ extractionStatus: 'failed' })];
    const result = await answerFromEvidence(plan, 'summarize my resume', candidates, context, mockAi('irrelevant'));
    expect(result.message).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
    expect(computerTools.readFile.execute).not.toHaveBeenCalled();
  });

  it('drops a candidate whose real text turns out to be empty/unreadable', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('');
    const result = await answerFromEvidence(plan, 'summarize my resume', [file()], context, mockAi('irrelevant'));
    expect(result.message).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
  });

  it('is honest when the AI is unavailable: lists the files, does not fabricate a summary', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Jagadeesh Boya, accessibility developer.');
    const result = await answerFromEvidence(plan, 'summarize my resume', [file()], context, { service: {} as AIService, available: false });
    expect(result.message).toContain('Resume.pdf');
    expect(result.message.toLowerCase()).toContain('not ready');
    expect(result.citations.length).toBe(1);
  });

  it('answers with a validated citation when the model cites real evidence', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Jagadeesh Boya, accessibility developer since 2022.');
    const result = await answerFromEvidence(
      plan,
      'what is my job title',
      [file()],
      context,
      mockAi('You are an accessibility developer [1].'),
    );
    expect(result.message).toBe('You are an accessibility developer [1].');
    expect(result.citations).toEqual([{ index: 1, path: 'C:\\Docs\\Resume.pdf', name: 'Resume.pdf' }]);
    expect(result.sourceLabel).toBe('files');
  });

  it('strips a citation marker the model invented that does not match real evidence', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Jagadeesh Boya, accessibility developer.');
    const result = await answerFromEvidence(
      plan,
      'what is my job title',
      [file()],
      context,
      mockAi('You are a developer [1], also a pilot [7].'),
    );
    expect(result.message).toBe('You are a developer [1], also a pilot .');
  });

  it('falls back to the insufficient-evidence message when the model refuses/errors', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Jagadeesh Boya, accessibility developer.');
    const ai = {
      service: { getProvider: () => ({ chat: async () => { throw new Error('model crashed'); } }) } as unknown as AIService,
      available: true,
    };
    const result = await answerFromEvidence(plan, 'what is my job title', [file()], context, ai);
    expect(result.message).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
  });

  it('reads at most maxEvidence candidates', async () => {
    const spy = vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Some real readable content here.');
    const candidates = Array.from({ length: 10 }, (_, i) => file({ path: `C:\\Docs\\F${i}.pdf`, name: `F${i}.pdf` }));
    await answerFromEvidence(plan, 'summarize these', candidates, context, mockAi('ok [1]'), 3);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe('groundedAnswer: stripInvalidCitations', () => {
  it('keeps citations within range and removes ones outside it', () => {
    expect(stripInvalidCitations('a [1] b [2] c [3]', 2)).toBe('a [1] b [2] c ');
  });

  it('leaves text with no citations untouched', () => {
    expect(stripInvalidCitations('no citations here', 3)).toBe('no citations here');
  });
});

describe('groundedAnswer: sourceLabelFor', () => {
  it('classifies the source of an answer', () => {
    expect(sourceLabelFor(true, false)).toBe('files');
    expect(sourceLabelFor(false, true)).toBe('device');
    expect(sourceLabelFor(true, true)).toBe('mixed');
    expect(sourceLabelFor(false, false)).toBe('general');
  });
});
