import { BaseAIProvider } from './aiProvider';
import { AIProviderType } from '@/types/ai';
import { proxyFetch } from './proxyFetch';

export class OllamaProvider extends BaseAIProvider {
  type: AIProviderType = 'ollama';
  name = 'Ollama';

  constructor(endpoint: string = 'http://127.0.0.1:11434') {
    super(endpoint);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await proxyFetch(`${this.endpoint}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await proxyFetch(`${this.endpoint}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m: { name: string }) => m.name);
    } catch {
      return [];
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    const model = options?.model || 'llama3:latest';
    const res = await proxyFetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: options?.stream ?? false,
        options: {
          temperature: options?.temperature ?? 0.2,
        },
        // Note: Ollama doesn't natively support tool calling in the same way as OpenAI
        // This implementation would need to be adapted based on how you want to handle tools
        // For now, we'll ignore tools parameter and return plain text
        // In a full implementation, you would format tools appropriately for Ollama
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama chat failed with status ${res.status}`);
    }

    const data = await res.json();

    // For now, Ollama provider doesn't support structured tool calls
    // In a full implementation, you would parse the response for tool calls
    // Return plain text for compatibility
    return data.message?.content || '';
  }

  async *streamChat(messages: { role: string; content: string }[], options?: { model?: string; temperature?: number; tools?: any[] }): AsyncIterable<any> {
    // Streaming implementation for Ollama
    // This is a simplified version - a full implementation would handle streaming properly
    const model = options?.model || 'llama3:latest';
    const res = await proxyFetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.2,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama streamChat failed with status ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Response body not available');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        yield chunk;
      }
    } finally {
      reader.releaseLock();
    }
  }

  supportsTools(): boolean {
    // Ollama doesn't natively support tool calling in the standard way
    // This would return false unless using a specially configured model
    return false;
  }

  async getModelInfo(): Promise<{ name: string; version?: string; parameters?: string; }> {
    try {
      const models = await this.listModels();
      const modelName = models.length > 0 ? models[0] : 'llama3:latest';
      return {
        name: modelName,
        // Ollama doesn't provide detailed version/parameter info via API
        // This would need to be enhanced based on specific model knowledge
      };
    } catch {
      return { name: 'unknown' };
    }
  }

  async embed(text: string, model: string = 'nomic-embed-text:latest'): Promise<number[]> {
    try {
      const res = await proxyFetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: text,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama embed failed: ${res.statusText}`);
      }

      const data = await res.json();
      return data.embedding || [];
    } catch (error: any) {
      throw new Error(`Ollama embed failed: ${error?.message || String(error)}`);
    }
  }

  async embedBatch(texts: string[], model: string = 'nomic-embed-text:latest'): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const emb = await this.embed(text, model);
      results.push(emb);
    }
    return results;
  }
}
