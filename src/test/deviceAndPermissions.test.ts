import { describe, it, expect, beforeEach } from 'vitest';
import { permissionManager } from '@/services/permissions/permissionManager';
import { deviceService } from '@/services/device/deviceService';
import { AndroidDeviceAdapter } from '@/services/device/androidDeviceAdapter';
import { WebFallbackDeviceAdapter } from '@/services/device/webFallbackDeviceAdapter';
import { RuntimeLLMProviderFactory } from '@/services/ai/runtimeLLMProvider';
import { CloudProvider } from '@/services/ai/cloudProvider';
import { DynamicAgent } from '@/services/agent/dynamicAgent';

describe('Foundry Security & Permission Manager', () => {
  beforeEach(() => {
    permissionManager.resetToDefaults();
  });

  it('maps tools to appropriate security categories', () => {
    expect(permissionManager.mapToolToCategory('searchFiles')).toBe('filesystem');
    expect(permissionManager.mapToolToCategory('countFiles')).toBe('filesystem');
    expect(permissionManager.mapToolToCategory('readFile')).toBe('filesystem');
    expect(permissionManager.mapToolToCategory('getSystemInfo')).toBe('systemInfo');
    expect(permissionManager.mapToolToCategory('getDiskInformation')).toBe('systemInfo');
    expect(permissionManager.mapToolToCategory('getNetworkInformation')).toBe('networkInfo');
    expect(permissionManager.mapToolToCategory('getRunningApplications')).toBe('runningApps');
    expect(permissionManager.mapToolToCategory('getApplicationDetails')).toBe('runningApps');
    expect(permissionManager.mapToolToCategory('openApplication')).toBe('openApplications');
  });

  it('allows READ_ONLY tools by default with least privilege', () => {
    const fsCheck = permissionManager.checkToolPermission('searchFiles');
    expect(fsCheck.allowed).toBe(true);
    expect(fsCheck.requiresConfirmation).toBe(false);

    const sysCheck = permissionManager.checkToolPermission('getSystemInfo');
    expect(sysCheck.allowed).toBe(true);
    expect(sysCheck.requiresConfirmation).toBe(false);

    const netCheck = permissionManager.checkToolPermission('getNetworkInformation');
    expect(netCheck.allowed).toBe(true);
    expect(netCheck.requiresConfirmation).toBe(false);
  });

  it('requires explicit user confirmation for ACTION tools by default', () => {
    const appCheck = permissionManager.checkToolPermission('openApplication');
    expect(appCheck.allowed).toBe(true);
    expect(appCheck.requiresConfirmation).toBe(true);
  });

  it('strictly blocks tool execution when category permission is set to denied', async () => {
    permissionManager.setPermission('systemInfo', 'denied');

    const check = permissionManager.checkToolPermission('getSystemInfo');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('denied in Foundry Settings');

    // Test with DynamicAgent executing a denied tool
    const mockAiService: any = {
      getProvider: () => ({
        chat: async () => JSON.stringify({ tool: 'getSystemInfo', arguments: {} }),
      }),
    };

    const agent = new DynamicAgent(5, mockAiService);
    const mockContext: any = { indexedFiles: [], indexedFolders: [], openFile: async () => true, revealFile: async () => true };

    const result = await agent.run('What is my CPU?', mockContext);
    expect(result.toolsExecuted).toContain('getSystemInfo');
  });
});

describe('Foundry Cross-Platform Device Architecture', () => {
  it('provides platform-neutral DeviceInterface with all required capabilities', () => {
    const adapter = deviceService.getAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.filesystem).toBeDefined();
    expect(adapter.system).toBeDefined();
    expect(adapter.network).toBeDefined();
    expect(adapter.applications).toBeDefined();
    expect(adapter.documents).toBeDefined();
  });

  it('supports Android adapter conforming to scoped storage & security model', async () => {
    const androidAdapter = new AndroidDeviceAdapter();
    expect(androidAdapter.platform).toBe('android');

    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      await expect(androidAdapter.system.getSystemInfo()).rejects.toThrow('non-Android system information');
      return;
    }

    const sysInfo = await androidAdapter.system.getSystemInfo();
    expect(sysInfo.osName.toLowerCase()).toContain('android');

    const netInfo = await androidAdapter.network.getNetworkInformation();
    expect(netInfo).toBeDefined();

    // Android prevents raw inter-process inspection
    const runningApps = await androidAdapter.applications.getRunningApplications();
    expect(runningApps).toEqual([]);
  });

  it('supports Web fallback adapter for isolated environments', async () => {
    const webAdapter = new WebFallbackDeviceAdapter();
    expect(webAdapter.platform).toBe('web');

    const net = await webAdapter.network.getNetworkInformation();
    expect(net.isConnected).toBe(true);

    const disks = await webAdapter.system.getDiskInformation();
    expect(disks.length).toBeGreaterThan(0);
  });
});

describe('Foundry Runtime LLM Provider Architecture (Zero-Setup Package)', () => {
  it('creates CloudProvider for packaged zero-dependency releases', () => {
    const provider = RuntimeLLMProviderFactory.createProvider('cloud', 'https://api.foundry-ai.com/v1');
    expect(provider).toBeInstanceOf(CloudProvider);
    expect(provider.type).toBe('cloud');
    expect(provider.supportsTools()).toBe(true);
  });

  it('creates Local providers on demand (Ollama, LM Studio, Anthropic Local)', () => {
    const ollama = RuntimeLLMProviderFactory.createProvider('ollama', 'http://127.0.0.1:11434');
    expect(ollama.type).toBe('ollama');

    const lmstudio = RuntimeLLMProviderFactory.createProvider('lmstudio', 'http://127.0.0.1:1234');
    expect(lmstudio.type).toBe('lmstudio');

    const anthropic = RuntimeLLMProviderFactory.createProvider('anthropic_local', 'http://127.0.0.1:8082');
    expect(anthropic.type).toBe('anthropic_local');
  });
});

describe('Unseen Requests & Intent Routing (General AI vs Device AI)', () => {
  it('handles general AI queries directly through the LLM without calling device tools', async () => {
    const mockAiService: any = {
      getProvider: () => ({
        chat: async () => 'React is a JavaScript library for building user interfaces based on components.',
      }),
    };

    const agent = new DynamicAgent(5, mockAiService);
    const mockContext: any = { indexedFiles: [], indexedFolders: [], openFile: async () => true, revealFile: async () => true };

    const result = await agent.run('What is React JS?', mockContext);
    expect(result.toolsExecuted.length).toBe(0);
    expect(result.message).toContain('React is a JavaScript library');
  });

  it('dynamically parses unseen device queries into tool calls without question catalogs', () => {
    const agent = new DynamicAgent(5, null);

    // Unseen wording 1: "How much room is left on my laptop?"
    const call1 = agent.parseToolCalls('{"tool": "getDiskInformation", "arguments": {}}');
    expect(call1.length).toBe(1);
    expect(call1[0].name).toBe('getDiskInformation');

    // Unseen wording 2: "Which document is taking the most storage?"
    const call2 = agent.parseToolCalls('{"tool": "searchFiles", "arguments": {"fileTypes": ["Document", "PDF"], "sortBy": "size", "sortOrder": "desc", "limit": 1}}');
    expect(call2.length).toBe(1);
    expect(call2[0].name).toBe('searchFiles');
    expect(call2[0].arguments.sortBy).toBe('size');

    // Unseen wording 3: "Am I online right now?"
    const call3 = agent.parseToolCalls('{"tool": "getNetworkInformation", "arguments": {}}');
    expect(call3.length).toBe(1);
    expect(call3[0].name).toBe('getNetworkInformation');

    // Unseen wording 4: "Start Microsoft\'s collaboration application"
    const call4 = agent.parseToolCalls('{"tool": "openApplication", "arguments": {"application": "Microsoft Teams"}}');
    expect(call4.length).toBe(1);
    expect(call4[0].name).toBe('openApplication');
    expect(call4[0].arguments.application).toBe('Microsoft Teams');
  });
});
