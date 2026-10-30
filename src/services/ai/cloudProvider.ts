/**
 * Foundry Cloud AI Provider
 * Communicates with the secure Foundry backend proxy without exposing private API keys to the client.
 * Provides out-of-the-box intelligence for released builds without requiring local Ollama/LM Studio installation.
 */

import { AIProviderType } from '@/types/ai';
import { BaseAIProvider } from './aiProvider';

export class CloudProvider extends BaseAIProvider {
  type: AIProviderType = 'cloud';
  name = 'Foundry Cloud AI (Zero-Setup)';

  constructor(endpoint = 'https://api.foundry-ai.com/v1') {
    super(endpoint);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check health of backend proxy
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      }).catch(async () => {
        return fetch(`${this.endpoint}/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id || m.name);
        }
      }
    } catch {}
    return ['foundry-standard', 'foundry-fast'];
  }

  async chat(
    messages: { role: string; content: string }[],
    options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || 'foundry-standard',
        messages,
        temperature: options?.temperature ?? 0.2,
        tools: options?.tools,
      }),
    });

    if (!res.ok) {
      throw new Error(`Cloud AI request failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    options?: { model?: string; temperature?: number; tools?: any[] }
  ): AsyncIterable<any> {
    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || 'foundry-standard',
        messages,
        temperature: options?.temperature ?? 0.2,
        tools: options?.tools,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Streaming failed: HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            yield parsed;
          } catch {}
        }
      }
    }
  }

  supportsTools(): boolean {
    return true;
  }

  async getModelInfo(): Promise<{ name: string; version?: string; parameters?: string }> {
    return {
      name: 'Foundry Cloud Assistant',
      version: '2.0.0',
      parameters: '70B MoE',
    };
  }

  async embed(text: string, model?: string): Promise<number[]> {
    const res = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: model || 'foundry-embed' }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.[0]?.embedding || [];
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    const res = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: model || 'foundry-embed' }),
    });
    if (!res.ok) return texts.map(() => []);
    const data = await res.json();
    return data.data?.map((d: any) => d.embedding) || texts.map(() => []);
  }
}
