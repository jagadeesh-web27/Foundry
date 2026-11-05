import { describe, it, expect, vi, beforeEach } from 'vitest';

// The desktop engine's status comes from the Rust backend; simulate it.
const desktopStatus = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string) => {
    if (cmd === 'desktop_ai_status') return Promise.resolve(desktopStatus());
    return Promise.reject(new Error(`unexpected command ${cmd}`));
  },
}));

import { AIService } from '@/services/ai/aiService';

const base = {
  runtimeFound: true,
  modelPath: 'C:/models/m.gguf',
  modelSizeBytes: 2_000_000_000,
  modelName: 'Llama 3.2 3B Instruct (Q4_K_M)',
  port: 8172,
  downloadState: 'done',
  downloadedBytes: 0,
  totalBytes: 0,
  errorMessage: null,
  defaultDownloadUrl: 'https://example.com/m.gguf',
};

describe('AI status keeps the on-device engine’s real state', () => {
  beforeEach(() => {
    // fallback probes (Ollama / LM Studio) are unreachable in tests
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });

  const service = () =>
    new AIService({ provider: 'desktop_local', endpoint: 'http://127.0.0.1:8172', model: 'foundry-desktop-local-model', embeddingModel: 'x', temperature: 0.2 });

  it('reports MODEL_LOADING while the model loads (so the chat waits instead of saying "not ready")', async () => {
    desktopStatus.mockReturnValue({ ...base, modelFound: true, serverRunning: true, serverReady: false });
    const status = await service().checkStatus(true);
    expect(status.isAvailable).toBe(false);
    expect(status.state).toBe('MODEL_LOADING');
  });

  it('reports MODEL_MISSING when the model is not downloaded', async () => {
    desktopStatus.mockReturnValue({ ...base, modelFound: false, serverRunning: false, serverReady: false, downloadState: 'idle' });
    const status = await service().checkStatus(true);
    expect(status.state).toBe('MODEL_MISSING');
  });

  it('reports READY once the engine is up', async () => {
    desktopStatus.mockReturnValue({ ...base, modelFound: true, serverRunning: true, serverReady: true });
    const status = await service().checkStatus(true);
    expect(status.isAvailable).toBe(true);
    expect(status.state).toBe('READY');
  });
});
