import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AndroidLocalAIProvider, LocalAIModelStatus } from '@/services/ai/androidLocalProvider';
import { AIService } from '@/services/ai/aiService';
import { dynamicAgent } from '@/services/agent/dynamicAgent';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('Foundry Standalone Android Local AI Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Model State Machine & Provider Contract', () => {
    it('reports not available and requires setup when state is MODEL_NOT_INSTALLED', async () => {
      const mockStatus: LocalAIModelStatus = {
        state: 'MODEL_NOT_INSTALLED',
        ready: false,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: null,
        modelSizeBytes: 0,
        downloadProgress: 0,
        downloadBytes: 0,
        totalBytes: 0,
        errorMessage: null,
        inferenceVerified: false,
        lastInferenceTimeMs: 0,
        defaultDownloadUrl: 'https://huggingface.co/google/gemma-2b-it/resolve/main/gemma-2b-it-cpu-int4.task',
      };

      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(mockStatus));

      const provider = new AndroidLocalAIProvider();
      const isAvailable = await provider.isAvailable();
      expect(isAvailable).toBe(false);

      const status = await provider.getModelStatus();
      expect(status.state).toBe('MODEL_NOT_INSTALLED');
      expect(status.ready).toBe(false);
    });

    it('reports not available when state is MODEL_DOWNLOADING', async () => {
      const mockStatus: LocalAIModelStatus = {
        state: 'MODEL_DOWNLOADING',
        ready: false,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: null,
        modelSizeBytes: 0,
        downloadProgress: 45,
        downloadBytes: 650000000,
        totalBytes: 1440000000,
        errorMessage: null,
        inferenceVerified: false,
        lastInferenceTimeMs: 0,
        defaultDownloadUrl: 'https://huggingface.co/google/gemma-2b-it/resolve/main/gemma-2b-it-cpu-int4.task',
      };

      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(mockStatus));

      const provider = new AndroidLocalAIProvider();
      expect(await provider.isAvailable()).toBe(false);
    });

    it('reports not available during MODEL_VERIFYING and MODEL_LOADING', async () => {
      const verifyingStatus: LocalAIModelStatus = {
        state: 'MODEL_VERIFYING',
        ready: false,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: '/data/user/0/com.foundry.app.debug/files/foundry-models/foundry-model.task',
        modelSizeBytes: 1440000000,
        downloadProgress: 100,
        downloadBytes: 1440000000,
        totalBytes: 1440000000,
        errorMessage: null,
        inferenceVerified: false,
        lastInferenceTimeMs: 0,
        defaultDownloadUrl: 'https://huggingface.co/google/gemma-2b-it/resolve/main/gemma-2b-it-cpu-int4.task',
      };

      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(verifyingStatus));
      const provider = new AndroidLocalAIProvider();
      expect(await provider.isAvailable()).toBe(false);

      const loadingStatus = { ...verifyingStatus, state: 'MODEL_LOADING' as const };
      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(loadingStatus));
      expect(await provider.isAvailable()).toBe(false);
    });

    it('reports ready and available ONLY when model is loaded and STATE is MODEL_READY', async () => {
      const readyStatus: LocalAIModelStatus = {
        state: 'MODEL_READY',
        ready: true,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: '/data/user/0/com.foundry.app.debug/files/foundry-models/foundry-model.task',
        modelSizeBytes: 1440000000,
        downloadProgress: 100,
        downloadBytes: 1440000000,
        totalBytes: 1440000000,
        errorMessage: null,
        inferenceVerified: true,
        lastInferenceTimeMs: 340,
        defaultDownloadUrl: 'https://huggingface.co/google/gemma-2b-it/resolve/main/gemma-2b-it-cpu-int4.task',
      };

      vi.mocked(invoke).mockResolvedValue(JSON.stringify(readyStatus));

      const provider = new AndroidLocalAIProvider();
      expect(await provider.isAvailable()).toBe(true);

      const check = await provider.checkStatus();
      expect(check.isAvailable).toBe(true);
      expect(check.providerType).toBe('android_local');
    });

    it('prevents chat calls when model is not ready', async () => {
      const notReadyStatus: LocalAIModelStatus = {
        state: 'MODEL_NOT_INSTALLED',
        ready: false,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: null,
        modelSizeBytes: 0,
        downloadProgress: 0,
        downloadBytes: 0,
        totalBytes: 0,
        errorMessage: null,
        inferenceVerified: false,
        lastInferenceTimeMs: 0,
        defaultDownloadUrl: 'https://huggingface.co/google/gemma-2b-it/resolve/main/gemma-2b-it-cpu-int4.task',
      };

      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(notReadyStatus));

      const provider = new AndroidLocalAIProvider();
      await expect(provider.chat([{ role: 'user', content: 'What is React?' }])).rejects.toThrow(
        /Local AI model is not installed or ready/
      );
    });
  });

  describe('2. Elimination of PC LAN Server (192.168.5.175:8082)', () => {
    it('AIService in android_local mode returns explicit error without probing PC servers', async () => {
      const mockStatus: LocalAIModelStatus = {
        state: 'MODEL_NOT_INSTALLED',
        ready: false,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: null,
        modelSizeBytes: 0,
        downloadProgress: 0,
        downloadBytes: 0,
        totalBytes: 0,
        errorMessage: null,
        inferenceVerified: false,
        lastInferenceTimeMs: 0,
        defaultDownloadUrl: '',
      };

      vi.mocked(invoke).mockResolvedValue(JSON.stringify(mockStatus));

      const aiService = new AIService({
        provider: 'android_local',
        endpoint: 'android-local://',
        model: 'foundry-android-local-model',
        embeddingModel: 'local-keywords',
        temperature: 0.2,
      });

      const status = await aiService.checkStatus(true);
      expect(status.isAvailable).toBe(false);
      expect(status.providerType).toBe('android_local');
      expect(status.errorMessage).toContain('Local AI model is not installed or ready');
      expect(status.endpoint).toBe('android-local://');
      expect(status.endpoint).not.toContain('192.168.5.175');
      expect(status.endpoint).not.toContain('8082');
    });
  });

  describe('3. Low-Level Inference Execution & Tool Calling', () => {
    it('executes low-level test and captures generated output', async () => {
      const mockTestOutput = {
        success: true,
        prompt: 'Explain TypeScript in one sentence.',
        response: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
        elapsedMs: 285,
        state: 'MODEL_READY',
      };

      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(mockTestOutput));

      const provider = new AndroidLocalAIProvider();
      const result = await provider.testInference('Explain TypeScript in one sentence.');

      expect(result.success).toBe(true);
      expect(result.prompt).toBe('Explain TypeScript in one sentence.');
      expect(result.response).toContain('TypeScript is a strongly typed programming language');
      expect(result.elapsedMs).toBe(285);
    });

    it('dynamic agent executes general knowledge question without calling device tools', async () => {
      const readyStatus: LocalAIModelStatus = {
        state: 'MODEL_READY',
        ready: true,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: '/path/to/model.task',
        modelSizeBytes: 1440000000,
        downloadProgress: 100,
        downloadBytes: 1440000000,
        totalBytes: 1440000000,
        errorMessage: null,
        inferenceVerified: true,
        lastInferenceTimeMs: 250,
        defaultDownloadUrl: '',
      };

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'android_local_ai_status') return JSON.stringify(readyStatus);
        if (cmd === 'android_local_ai_chat') {
          return 'React is a popular open-source JavaScript library developed by Meta for building dynamic user interfaces.';
        }
        return '';
      });

      const aiService = new AIService({
        provider: 'android_local',
        endpoint: 'android-local://',
        model: 'foundry-android-local-model',
        embeddingModel: 'local-keywords',
        temperature: 0.2,
      });

      dynamicAgent.aiService = aiService;
      const res = await dynamicAgent.run('What is React?', {
        indexedFiles: [],
        indexedFolders: [],
        openFile: vi.fn(),
        revealFile: vi.fn(),
      });

      expect(res.message).toContain('React is a popular open-source JavaScript library');
      expect(res.toolsExecuted).toHaveLength(0); // General questions must NOT call device tools
    });

    it('dynamic agent calls getBatteryInformation dynamically for battery question', async () => {
      const readyStatus: LocalAIModelStatus = {
        state: 'MODEL_READY',
        ready: true,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: '/path/to/model.task',
        modelSizeBytes: 1440000000,
        downloadProgress: 100,
        downloadBytes: 1440000000,
        totalBytes: 1440000000,
        errorMessage: null,
        inferenceVerified: true,
        lastInferenceTimeMs: 250,
        defaultDownloadUrl: '',
      };

      let turn = 0;
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'android_local_ai_status') return JSON.stringify(readyStatus);
        if (cmd === 'android_local_ai_chat') {
          turn++;
          if (turn === 1) {
            // First turn: dynamic model requests battery tool
            return JSON.stringify({
              tool: 'getBatteryInformation',
              arguments: {},
            });
          } else {
            // Second turn: model answers with battery data
            return 'Your battery level is currently at 82% and is not charging.';
          }
        }
        if (cmd === 'get_battery_information') {
          return { level: 82, is_charging: false, temperature_celsius: 29.2 };
        }
        return '';
      });

      const aiService = new AIService({
        provider: 'android_local',
        endpoint: 'android-local://',
        model: 'foundry-android-local-model',
        embeddingModel: 'local-keywords',
        temperature: 0.2,
      });

      dynamicAgent.aiService = aiService;
      const res = await dynamicAgent.run('What is my battery level?', {
        indexedFiles: [],
        indexedFolders: [],
        openFile: vi.fn(),
        revealFile: vi.fn(),
      });

      expect(res.toolsExecuted).toContain('getBatteryInformation');
      expect(res.message).toContain('82%');
    });

    it('dynamic agent calls searchFiles with sortBy size desc for largest video question', async () => {
      const readyStatus: LocalAIModelStatus = {
        state: 'MODEL_READY',
        ready: true,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: '/path/to/model.task',
        modelSizeBytes: 1440000000,
        downloadProgress: 100,
        downloadBytes: 1440000000,
        totalBytes: 1440000000,
        errorMessage: null,
        inferenceVerified: true,
        lastInferenceTimeMs: 250,
        defaultDownloadUrl: '',
      };

      let turn = 0;
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'android_local_ai_status') return JSON.stringify(readyStatus);
        if (cmd === 'android_local_ai_chat') {
          turn++;
          if (turn === 1) {
            return JSON.stringify({
              tool: 'searchFiles',
              arguments: { fileTypes: ['Video'], sortBy: 'size', sortOrder: 'desc', limit: 1 },
            });
          } else {
            return 'The largest video on your device is vacation_2026.mp4 with a size of 3.4 GB.';
          }
        }
        if (cmd === 'search_files_live') {
          return [
            {
              path: '/sdcard/Movies/vacation_2026.mp4',
              name: 'vacation_2026.mp4',
              extension: 'mp4',
              size: 3400000000,
              file_type: 'Video',
            },
          ];
        }
        return '';
      });

      const aiService = new AIService({
        provider: 'android_local',
        endpoint: 'android-local://',
        model: 'foundry-android-local-model',
        embeddingModel: 'local-keywords',
        temperature: 0.2,
      });

      dynamicAgent.aiService = aiService;
      const res = await dynamicAgent.run('What is the largest video on my phone?', {
        indexedFiles: [],
        indexedFolders: [],
        openFile: vi.fn(),
        revealFile: vi.fn(),
      });

      expect(res.toolsExecuted).toContain('searchFiles');
      expect(res.message).toContain('vacation_2026.mp4');
    });
  });
});
