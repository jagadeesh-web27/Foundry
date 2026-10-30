import { describe, it, expect, afterEach } from 'vitest';
import { computerTools, AgentContext } from '@/services/agent/tools';
import { toolRegistry } from '@/services/tools/toolRegistry';
import { permissionManager, PermissionDeniedError } from '@/services/permissions/permissionManager';
import { runDirectRoute } from '@/services/agent/directRouter';

const context: AgentContext = {
  indexedFiles: [
    {
      id: 'f1',
      name: 'React_Notes.md',
      path: 'C:/Users/me/Documents/React_Notes.md',
      extension: 'md',
      size: 1200,
      fileType: 'Document',
      createdAt: '2026-10-01T00:00:00Z',
      modifiedAt: '2026-10-01T00:00:00Z',
    } as any,
  ],
  indexedFolders: [],
  openFile: async () => true,
  revealFile: async () => true,
};

describe('Phase 0 safety: no fabricated file content', () => {
  it('readFile returns nothing (not placeholder text) when the file cannot actually be read', async () => {
    const text = await computerTools.readFile.execute({ path: 'C:/Users/me/Documents/React_Notes.md' }, context);
    expect(text).toBe('');
    expect(text).not.toMatch(/components, hooks/);
  });
});

describe('Phase 0 safety: permission settings apply to every code path', () => {
  afterEach(() => {
    permissionManager.setPermission('filesystem', 'allowed');
    permissionManager.setPermission('systemInfo', 'allowed');
  });

  it('a denied filesystem permission blocks direct tool calls', async () => {
    permissionManager.setPermission('filesystem', 'denied');
    await expect(computerTools.searchFiles.execute({ query: 'resume' }, context)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(computerTools.countFiles.execute({ extension: 'pdf' }, context)).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('a denied permission blocks the rule-based router and explains why', async () => {
    permissionManager.setPermission('systemInfo', 'denied');
    const res = await runDirectRoute({ kind: 'battery' }, 'what is my battery level', context);
    expect(res.message).toMatch(/denied in Foundry Settings/);
  });

  it('a denied permission blocks tools in the central registry', async () => {
    permissionManager.setPermission('systemInfo', 'denied');
    const tool = toolRegistry.getAllTools().find((t) => permissionManager.mapToolToCategory(t.name) === 'systemInfo');
    expect(tool).toBeDefined();
    await expect(tool!.execute({}, {})).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('allowed permissions still run normally', async () => {
    const files = await computerTools.searchFiles.execute({ query: 'react' }, context);
    expect(Array.isArray(files)).toBe(true);
  });
});
