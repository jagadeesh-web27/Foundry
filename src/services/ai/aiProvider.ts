import { AIProvider, AIProviderType, AIProviderStatus } from '@/types/ai';

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export abstract class BaseAIProvider implements AIProvider {
  abstract type: AIProviderType;
  abstract name: string;
  protected endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  abstract isAvailable(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;
  abstract chat(messages: { role: string; content: string }[], options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }): Promise<string>;
  abstract streamChat(messages: { role: string; content: string }[], options?: { model?: string; temperature?: number; tools?: any[] }): AsyncIterable<any>;
  abstract supportsTools(): boolean;
  abstract getModelInfo(): Promise<{ name: string; version?: string; parameters?: string; }>;
  abstract embed(text: string, model?: string): Promise<number[]>;
  abstract embedBatch(texts: string[], model?: string): Promise<number[][]>;

  async checkStatus(model: string, embeddingModel: string): Promise<AIProviderStatus> {
    const start = performance.now();
    try {
      const available = await this.isAvailable();
      const latency = Math.round(performance.now() - start);

      if (!available) {
        return {
          isAvailable: false,
          providerType: this.type,
          endpoint: this.endpoint,
          modelName: model,
          embeddingModel: embeddingModel,
          latencyMs: latency,
          state: 'NOT_INSTALLED',
          errorMessage: `Could not connect to ${this.name} at ${this.endpoint}`,
        };
      }

      // Check models list
      let models: string[] = [];
      try {
        models = await this.listModels();
      } catch {
        models = [];
      }

      let state: import('@/types/ai').DesktopAIProviderState = 'AVAILABLE';
      let errorMessage: string | undefined = undefined;

      if (models.length === 0) {
        state = 'MODEL_MISSING';
        errorMessage = `No models currently installed in ${this.name}`;
      } else if (model && !models.some((m) => m.toLowerCase().includes(model.toLowerCase()) || model.toLowerCase().includes(m.toLowerCase()))) {
        state = 'MODEL_MISSING';
        errorMessage = `Specified model "${model}" is not installed in ${this.name}`;
      } else {
        state = 'READY';
      }

      return {
        isAvailable: true,
        providerType: this.type,
        endpoint: this.endpoint,
        modelName: model,
        embeddingModel: embeddingModel,
        latencyMs: latency,
        state,
        installedModels: models,
        errorMessage,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      return {
        isAvailable: false,
        providerType: this.type,
        endpoint: this.endpoint,
        modelName: model,
        embeddingModel: embeddingModel,
        state: 'ERROR',
        errorMessage: msg,
      };
    }
  }
}
