import { describe, it, expect, vi, afterEach } from 'vitest';
import { agentRunner } from '@/services/agent/agentRunner';
import { computerTools, AgentContext } from '@/services/agent/tools';
import { IndexedFile } from '@/types/file';
import { ConversationContext } from '@/services/agent/referenceResolver';

function file(name: string): IndexedFile {
  return {
    id: name,
    path: `C:\\Docs\\${name}`,
    name,
    extension: name.split('.').pop() || '',
    size: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    fileType: 'Document',
    indexedAt: '2026-01-01T00:00:00.000Z',
    status: 'indexed',
  };
}

const budget = file('Budget.pdf');
const forecast = file('Forecast.pdf');
const resume = file('Resume.pdf');

function mockContext(): AgentContext {
  return {
    indexedFiles: [],
    indexedFolders: [],
    openFile: vi.fn().mockResolvedValue(true),
    revealFile: vi.fn().mockResolvedValue(true),
  };
}

describe('agentRunner: follow-up reference resolution end-to-end (the task prompt\'s own examples)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('"summarize the second one" resolves against the previous result set', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Forecast figures for next quarter.');
    const context = mockContext();
    const conversationContext: ConversationContext = { lastFiles: [budget, forecast] };
    const response = await agentRunner.run('summarize the second one', context, undefined, false, conversationContext);
    expect(response.files?.[0]?.name).toBe('Forecast.pdf');
    expect(response.plan?.intent).toBe('FOLLOWUP_GROUNDED');
  });

  it('"open that file" opens the single file from the previous turn', async () => {
    const context = mockContext();
    const conversationContext: ConversationContext = { lastFiles: [resume] };
    const response = await agentRunner.run('open that file', context, undefined, false, conversationContext);
    expect(context.openFile).toHaveBeenCalledWith(resume.path);
    expect(response.message).toContain('Resume.pdf');
    expect(response.plan?.intent).toBe('FOLLOWUP_OPEN');
  });

  it('"compare it with the other PDF" resolves to the other file from two in play', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Some real readable budget content here.');
    const context = mockContext();
    const conversationContext: ConversationContext = { lastFiles: [budget, forecast] };
    const response = await agentRunner.run('compare it with the other PDF', context, undefined, false, conversationContext);
    expect(response.files?.[0]?.name).toBe('Forecast.pdf');
  });

  it('"what did it say about salary?" resolves unambiguously when one file was in play', async () => {
    vi.spyOn(computerTools.readFile, 'execute').mockResolvedValue('Salary is reviewed annually in March.');
    const context = mockContext();
    const conversationContext: ConversationContext = { lastFiles: [resume] };
    const response = await agentRunner.run('what did it say about salary?', context, undefined, false, conversationContext);
    expect(response.files?.[0]?.name).toBe('Resume.pdf');
  });

  it('"what did it say about salary?" is ambiguous with two files in play, and asks rather than guesses', async () => {
    const context = mockContext();
    const conversationContext: ConversationContext = { lastFiles: [budget, forecast] };
    const response = await agentRunner.run('what did it say about salary?', context, undefined, false, conversationContext);
    expect(response.plan?.intent).toBe('FOLLOWUP_AMBIGUOUS');
    expect(response.message.toLowerCase()).toContain('which one');
  });

  it('a follow-up phrase with no prior turn is reported honestly, never guessed', async () => {
    const context = mockContext();
    const response = await agentRunner.run('summarize the second one', context, undefined, false, undefined);
    expect(response.plan?.intent).toBe('FOLLOWUP_NO_CONTEXT');
  });

  it('"show me the one from yesterday" is a fresh time-filtered search, not a follow-up reference', async () => {
    const context = mockContext();
    const conversationContext: ConversationContext = { lastFiles: [budget, forecast] };
    const response = await agentRunner.run('show me the one from yesterday', context, undefined, false, conversationContext);
    expect(response.plan?.intent).not.toMatch(/^FOLLOWUP_/);
  });
});
