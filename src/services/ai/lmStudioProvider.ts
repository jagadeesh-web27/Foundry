import { BaseAIProvider } from './aiProvider';
import { AIProviderType } from '@/types/ai';
import { proxyFetch } from './proxyFetch';

export class LMStudioProvider extends BaseAIProvider {
  type: AIProviderType = 'lmstudio';
  name = 'LM Studio';

  constructor(endpoint: string = 'http://127.0.0.1:1234') {
    super(endpoint);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await proxyFetch(`${this.endpoint}/v1/models`, {
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
      const res = await proxyFetch(`${this.endpoint}/v1/models`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map((m: { id: string }) => m.id);
    } catch {
      return [];
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    const model = options?.model || 'local-model';
    const res = await proxyFetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        // Note: LM Studio (OpenAI-compatible) supports tool calling
        // This would need to be implemented based on the specific endpoint's capabilities
        // For now, we'll ignore tools parameter and return plain text
        // In a full implementation, you would add tools: options?.tools
      }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio chat failed with status ${res.status}`);
    }

    const data = await res.json();

    // For now, LM Studio provider doesn't return structured tool calls in this implementation
    // In a full implementation with tool calling support, you would check for tool_calls in the response
    // Return plain text for compatibility
    return data.choices?.[0]?.message?.content || '';
  }

  async *streamChat(messages: { role: string; content: string }[], options?: { model?: string; temperature?: number; tools?: any[] }): AsyncIterable<any> {
    // Streaming implementation for LM Studio (OpenAI-compatible)
    const model = options?.model || 'local-model';
    const res = await proxyFetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: options?.temperature ?? 0.2,
        // tools: options?.tools, // Would add tools for streaming with tool support
      }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio streamChat failed with status ${res.status}`);
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
    // LM Studio with OpenAI-compatible API does support tool calling
    // This would return true for endpoints that support it
    return true;
  }

  async getModelInfo(): Promise<{ name: string; version?: string; parameters?: string; }> {
    try {
      const models = await this.listModels();
      const modelName = models.length > 0 ? models[0] : 'local-model';
      return {
        name: modelName,
        // LM Studio/OpenAI-compatible API doesn't provide detailed version/parameter info via /v1/models
        // This would need to be enhanced based on specific model knowledge or additional API calls
      };
    } catch {
      return { name: 'unknown' };
    }
  }

  async embed(text: string, model: string = 'text-embedding-nomic-embed-text-v1.5'): Promise<number[]> {
    const res = await proxyFetch(`${this.endpoint}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio embed failed: ${res.statusText}`);
    }

    const data = await res.json();
    return data.data?.[0]?.embedding || [];
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const emb = await this.embed(text, model);
      results.push(emb);
    }
    return results;
  }
}
