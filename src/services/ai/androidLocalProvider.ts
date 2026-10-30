import { BaseAIProvider } from './aiProvider';
import { AIProviderType, AIProviderStatus } from '@/types/ai';
import { invoke } from '@tauri-apps/api/core';

export type LocalAIModelState =
  | 'MODEL_NOT_INSTALLED'
  | 'MODEL_DOWNLOADING'
  | 'MODEL_VERIFYING'
  | 'MODEL_LOADING'
  | 'MODEL_READY'
  | 'INFERENCE_RUNNING'
  | 'MODEL_ERROR'
  | 'INFERENCE_ERROR';

export interface LocalAIModelStatus {
  state: LocalAIModelState;
  ready: boolean;
  modelName: string;
  modelFormat: string;
  modelPath: string | null;
  modelSizeBytes: number;
  downloadProgress: number;
  downloadBytes: number;
  totalBytes: number;
  errorMessage: string | null;
  inferenceVerified: boolean;
  lastInferenceTimeMs: number;
  defaultDownloadUrl: string;
}

export interface LowLevelInferenceResult {
  success: boolean;
  prompt: string;
  response?: string;
  error?: string;
  elapsedMs?: number;
  state: LocalAIModelState;
}

/**
 * Foundry Android Local AI Provider
 * Runs LLM inference entirely on the Android device using Google MediaPipe Tasks GenAI.
 *
 * This provider runs 100% offline on-device and does not require PC, USB, Wi-Fi,
 * LAN servers, Ollama, LM Studio, or cloud AI for reasoning.
 */
export class AndroidLocalAIProvider extends BaseAIProvider {
  type: AIProviderType = 'android_local';
  name = 'Foundry On-Device AI (Android)';

  constructor(endpoint: string = 'android-local://') {
    super(endpoint);
  }

  async getModelStatus(): Promise<LocalAIModelStatus> {
    try {
      const raw = await invoke<string>('android_local_ai_status');
      return JSON.parse(raw) as LocalAIModelStatus;
    } catch (e: any) {
      return {
        state: 'MODEL_NOT_INSTALLED',
        ready: false,
        modelName: 'Gemma 2B IT (int4)',
        modelFormat: 'MediaPipe .task',
        modelPath: null,
        modelSizeBytes: 0,
        downloadProgress: 0,
        downloadBytes: 0,
        totalBytes: 0,
        errorMessage: e?.message || 'Android AI bridge unavailable',
        inferenceVerified: false,
        lastInferenceTimeMs: 0,
        defaultDownloadUrl: 'https://huggingface.co/google/gemma-2b-it/resolve/main/gemma-2b-it-cpu-int4.task',
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.getModelStatus();
      if (status.ready && (status.state === 'MODEL_READY' || status.state === 'INFERENCE_RUNNING')) {
        return true;
      }
      if (status.modelSizeBytes > 10000000 && status.state !== 'MODEL_LOADING' && status.state !== 'MODEL_VERIFYING') {
        this.loadModel().catch(() => {});
      }
      return false;
    } catch {
      return false;
    }
  }

  async checkStatus(model?: string, embeddingModel?: string): Promise<AIProviderStatus> {
    try {
      const status = await this.getModelStatus();
      const ready = Boolean(status.ready && (status.state === 'MODEL_READY' || status.state === 'INFERENCE_RUNNING'));
      if (!ready && status.modelSizeBytes > 10000000 && status.state !== 'MODEL_LOADING' && status.state !== 'MODEL_VERIFYING') {
        this.loadModel().catch(() => {});
      }

      return {
        isAvailable: ready,
        providerType: this.type,
        endpoint: this.endpoint,
        modelName: status.modelName || model || 'Gemma 2B IT (int4)',
        embeddingModel: embeddingModel || 'local-keywords',
        errorMessage: ready ? undefined : (status.errorMessage || `Model status: ${status.state}. Local AI setup required.`),
      };
    } catch (e: any) {
      return {
        isAvailable: false,
        providerType: this.type,
        endpoint: this.endpoint,
        modelName: model || 'Gemma 2B IT (int4)',
        embeddingModel: embeddingModel || 'local-keywords',
        errorMessage: e?.message || 'Local AI model is not installed or ready.',
      };
    }
  }

  async startDownload(url?: string): Promise<LocalAIModelStatus> {
    const raw = await invoke<string>('android_local_ai_start_download', { url: url || null });
    return JSON.parse(raw) as LocalAIModelStatus;
  }

  async cancelDownload(): Promise<LocalAIModelStatus> {
    const raw = await invoke<string>('android_local_ai_cancel_download');
    return JSON.parse(raw) as LocalAIModelStatus;
  }

  async loadModel(): Promise<LocalAIModelStatus> {
    const raw = await invoke<string>('android_local_ai_load_model');
    return JSON.parse(raw) as LocalAIModelStatus;
  }

  async deleteModel(): Promise<LocalAIModelStatus> {
    const raw = await invoke<string>('android_local_ai_delete_model');
    return JSON.parse(raw) as LocalAIModelStatus;
  }

  async installModelFromUri(uri: string): Promise<LocalAIModelStatus> {
    const raw = await invoke<string>('android_local_ai_install_model', { uri });
    return JSON.parse(raw) as LocalAIModelStatus;
  }

  async testInference(prompt: string): Promise<LowLevelInferenceResult> {
    const raw = await invoke<string>('android_local_ai_test_inference', { prompt });
    return JSON.parse(raw) as LowLevelInferenceResult;
  }

  async listModels(): Promise<string[]> {
    const status = await this.getModelStatus();
    return status.ready ? [status.modelName] : [];
  }

  async chat(
    messages: { role: string; content: string }[],
    _options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    let status = await this.getModelStatus();
    if (!status.ready) {
      if (status.modelSizeBytes > 10000000 && (status.state === 'MODEL_VERIFYING' || status.state === 'MODEL_READY')) {
        status = await this.loadModel();
      }
      if (!status.ready) {
        throw new Error(
          `Local AI model is not installed or ready (current state: ${status.state}). Please complete Local AI Setup.`
        );
      }
    }

    const systemParts: string[] = [];
    const turns: { role: 'user' | 'model'; content: string }[] = [];

    for (const message of messages) {
      const role = message.role.toLowerCase();
      if (role === 'system') {
        systemParts.push(message.content);
      } else if (role === 'user') {
        if (turns.length === 0 && systemParts.length > 0) {
          turns.push({
            role: 'user',
            content: `[System Instructions]\n${systemParts.join('\n\n')}\n\n[User Request]\n${message.content}`,
          });
        } else {
          turns.push({ role: 'user', content: message.content });
        }
      } else {
        turns.push({ role: 'model', content: message.content });
      }
    }

    if (turns.length === 0 && systemParts.length > 0) {
      turns.push({
        role: 'user',
        content: `[System Instructions]\n${systemParts.join('\n\n')}`,
      });
    }

    let prompt =
      turns
        .map((t) => `<start_of_turn>${t.role}\n${t.content}<end_of_turn>`)
        .join('\n') + '\n<start_of_turn>model\n';

    // Guard MediaPipe native KV cache (2048 tokens / ~4000 characters) against overflow SIGSEGV
    if (prompt.length > 3500 && turns.length > 1) {
      const firstTurn = turns[0];
      const lastTurn = turns[turns.length - 1];
      const maxFirst = 1800;
      const maxLast = 1500;
      prompt = `<start_of_turn>${firstTurn.role}\n${firstTurn.content.slice(0, maxFirst)}<end_of_turn>\n<start_of_turn>${lastTurn.role}\n${lastTurn.content.slice(0, maxLast)}<end_of_turn>\n<start_of_turn>model\n`;
    }

    return invoke<string>('android_local_ai_chat', { prompt });
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    options?: { model?: string; temperature?: number; tools?: any[] }
  ): AsyncIterable<any> {
    const fullText = await this.chat(messages, options);
    // Simulate streaming chunks for UI rendering
    const chunkSize = 8;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      const chunk = fullText.substring(i, Math.min(i + chunkSize, fullText.length));
      yield {
        choices: [{
          delta: { content: chunk }
        }]
      };
    }
  }

  supportsTools(): boolean {
    return true;
  }

  async getModelInfo(): Promise<{ name: string; version?: string; parameters?: string }> {
    const status = await this.getModelStatus();
    return {
      name: status.modelName,
      version: `${status.modelFormat} (${status.state})`,
      parameters: status.modelSizeBytes > 0
        ? `${(status.modelSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB on disk`
        : 'Not installed',
    };
  }

  async embed(_text: string, _model?: string): Promise<number[]> {
    throw new Error('Embeddings are handled via local keyword retrieval on mobile.');
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t, model)));
  }
}