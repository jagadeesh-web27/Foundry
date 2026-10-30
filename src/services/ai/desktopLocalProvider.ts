import { invoke } from '@tauri-apps/api/core';
import { AIProviderStatus, AIProviderType } from '@/types/ai';
import { LMStudioProvider } from './lmStudioProvider';
import { proxyFetch } from './proxyFetch';

export type DesktopDownloadState = 'idle' | 'downloading' | 'done' | 'error';

export interface DesktopAIStatus {
  runtimeFound: boolean;
  modelFound: boolean;
  modelPath: string;
  modelSizeBytes: number;
  modelName: string;
  serverRunning: boolean;
  serverReady: boolean;
  port: number;
  downloadState: DesktopDownloadState;
  downloadedBytes: number;
  totalBytes: number;
  errorMessage: string | null;
  defaultDownloadUrl: string;
}

export const DESKTOP_LOCAL_ENDPOINT = 'http://127.0.0.1:8172';
export const DESKTOP_LOCAL_MODEL = 'foundry-desktop-local-model';

// A 3B model on a laptop CPU can take a while for long answers.
const CHAT_TIMEOUT_MS = 300_000;
const MAX_ANSWER_TOKENS = 512;

/**
 * Foundry Desktop On-Device AI.
 * Talks to the llama-server engine that the Foundry desktop app bundles and manages itself,
 * so no Ollama, LM Studio or cloud service is needed. The server is OpenAI-compatible, so
 * this reuses the LM Studio wire format with Foundry-specific lifecycle handling.
 */
export class DesktopLocalAIProvider extends LMStudioProvider {
  type: AIProviderType = 'desktop_local';
  name = 'Foundry On-Device AI (Desktop)';

  constructor(endpoint: string = DESKTOP_LOCAL_ENDPOINT) {
    super(endpoint);
  }

  async getModelStatus(): Promise<DesktopAIStatus> {
    return invoke<DesktopAIStatus>('desktop_ai_status');
  }

  async startDownload(url?: string): Promise<DesktopAIStatus> {
    return invoke<DesktopAIStatus>('desktop_ai_start_download', { url: url || null });
  }

  async cancelDownload(): Promise<DesktopAIStatus> {
    return invoke<DesktopAIStatus>('desktop_ai_cancel_download');
  }

  async startEngine(): Promise<DesktopAIStatus> {
    return invoke<DesktopAIStatus>('desktop_ai_start_server');
  }

  async deleteModel(): Promise<DesktopAIStatus> {
    return invoke<DesktopAIStatus>('desktop_ai_delete_model');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.getModelStatus();
      if (status.serverReady) return true;
      // Installed but the engine is not up (e.g. it was stopped): start it in the background
      // and report unavailable for now; the periodic status check picks it up once loaded.
      if (status.runtimeFound && status.modelFound && !status.serverRunning) {
        void this.startEngine().catch(() => {});
      }
      return false;
    } catch {
      return false;
    }
  }

  async checkStatus(model: string, embeddingModel: string): Promise<AIProviderStatus> {
    try {
      const status = await this.getModelStatus();
      const base = {
        providerType: this.type,
        endpoint: this.endpoint,
        modelName: status.modelName || model,
        embeddingModel,
      };
      if (!status.runtimeFound) {
        return {
          ...base,
          isAvailable: false,
          state: 'NOT_INSTALLED',
          errorMessage: 'The Foundry local AI engine is missing from this installation.',
        };
      }
      if (!status.modelFound) {
        return {
          ...base,
          isAvailable: false,
          state: 'MODEL_MISSING',
          errorMessage:
            status.downloadState === 'downloading'
              ? 'Downloading the local AI model...'
              : status.errorMessage || 'Local AI model is not downloaded yet.',
        };
      }
      if (!status.serverReady) {
        void this.isAvailable();
        return { ...base, isAvailable: false, state: 'MODEL_LOADING', errorMessage: 'Loading the local AI model...' };
      }
      return { ...base, isAvailable: true, state: 'READY', installedModels: [status.modelName] };
    } catch (err: unknown) {
      return {
        isAvailable: false,
        providerType: this.type,
        endpoint: this.endpoint,
        modelName: model,
        embeddingModel,
        state: 'ERROR',
        errorMessage: err instanceof Error ? err.message : 'Local AI engine unavailable',
      };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const status = await this.getModelStatus();
      return status.modelFound ? [status.modelName] : [];
    } catch {
      return [];
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    const res = await proxyFetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: CHAT_TIMEOUT_MS,
      body: JSON.stringify({
        model: options?.model || DESKTOP_LOCAL_MODEL,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: MAX_ANSWER_TOKENS,
      }),
    });
    if (!res.ok) {
      throw new Error(`Local AI engine returned status ${res.status}. It may still be loading the model.`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    options?: { model?: string; temperature?: number; tools?: any[] }
  ): AsyncIterable<any> {
    // The Tauri HTTP bridge returns whole responses, so emit the full answer in chunks.
    const fullText = await this.chat(messages, options);
    const chunkSize = 8;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      yield { choices: [{ delta: { content: fullText.slice(i, i + chunkSize) } }] };
    }
  }

  async getModelInfo(): Promise<{ name: string; version?: string; parameters?: string }> {
    try {
      const status = await this.getModelStatus();
      return {
        name: status.modelName,
        version: 'GGUF (llama.cpp)',
        parameters: status.modelSizeBytes > 0 ? `${(status.modelSizeBytes / 1024 ** 3).toFixed(2)} GB on disk` : 'Not installed',
      };
    } catch {
      return { name: 'unknown' };
    }
  }

  async embed(_text: string, _model?: string): Promise<number[]> {
    throw new Error('Embeddings are handled via local keyword retrieval.');
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t, model)));
  }
}
