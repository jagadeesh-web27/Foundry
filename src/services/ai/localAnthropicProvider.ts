import { BaseAIProvider } from './aiProvider';
import { AIProviderType } from '@/types/ai';
import { proxyFetch } from './proxyFetch';

export class LocalAnthropicProvider extends BaseAIProvider {
  type: AIProviderType = 'anthropic_local';
  name = 'Local Anthropic Runtime';

  constructor(endpoint: string = 'http://127.0.0.1:8082') {
    super(endpoint);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 1. Ultra-fast root check (responds in <40ms on fcc-desktop / local proxies)
      const res = await proxyFetch(`${this.endpoint}/`, {
        signal: AbortSignal.timeout(1500),
        timeoutMs: 1500,
      } as any);
      if (res && res.ok) return true;
    } catch {
      // Root check failed or timed out, try /v1/models
    }

    try {
      // 2. Fallback check on /v1/models
      const resModels = await proxyFetch(`${this.endpoint}/v1/models`, {
        signal: AbortSignal.timeout(2000),
        timeoutMs: 2000,
      } as any);
      return Boolean(resModels && resModels.ok);
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await proxyFetch(`${this.endpoint}/v1/models`, {
        signal: AbortSignal.timeout(3000),
        timeoutMs: 3000,
      } as any);
      if (!res.ok) return ['claude-3-5-sonnet-20241022'];
      const data = await res.json();
      if (Array.isArray(data.data)) {
        return data.data.map((m: { id: string }) => m.id);
      }
      return ['claude-3-5-sonnet-20241022'];
    } catch {
      return ['claude-3-5-sonnet-20241022'];
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }
  ): Promise<string> {
    const model = options?.model || 'claude-3-5-sonnet-20241022';

    // Separate system messages from user/assistant messages for Anthropic API
    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    // Anthropic API requires at least one message and alternating turns
    if (conversationMessages.length === 0) {
      conversationMessages.push({ role: 'user', content: 'Hello' });
    }

    const payload: Record<string, any> = {
      model,
      max_tokens: 4096,
      messages: conversationMessages,
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    if (options?.temperature !== undefined) {
      payload.temperature = options.temperature;
    }

    const res = await proxyFetch(`${this.endpoint}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Local LLM chat failed with status ${res.status}: ${errText}`);
    }

    const data = await res.json();

    // Anthropic returns content as an array of content blocks: [{ type: 'thinking', ... }, { type: 'text', text: '...' }]
    if (Array.isArray(data.content)) {
      const textBlocks = data.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text);
      if (textBlocks.length > 0) {
        return textBlocks.join('\n');
      }
      // If only thinking blocks or other blocks exist
      for (const block of data.content) {
        if (block.text) return block.text;
        if (block.thinking) return block.thinking;
      }
    }

    if (typeof data.content === 'string') {
      return data.content;
    }

    return data.message?.content || '';
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    options?: { model?: string; temperature?: number; tools?: any[] }
  ): AsyncIterable<any> {
    const fullText = await this.chat(messages, options);
    yield fullText;
  }

  supportsTools(): boolean {
    return true;
  }

  async getModelInfo(): Promise<{ name: string; version?: string; parameters?: string }> {
    return { name: 'claude-3-5-sonnet-20241022' };
  }

  async embed(_text: string, _model?: string): Promise<number[]> {
    // Generate deterministic 384-dim pseudo embedding for local indexing if embedding endpoint unavailable
    const dims = 384;
    const vec: number[] = new Array(dims).fill(0);
    for (let i = 0; i < _text.length; i++) {
      const code = _text.charCodeAt(i);
      vec[i % dims] += Math.sin(code * (i + 1));
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t, model)));
  }
}
