import { AIProvider, AIProviderStatus, AIProviderType, Citation } from '@/types/ai';
import { AppSettings } from '@/types/settings';
import { BaseAIProvider } from './aiProvider';
import { RuntimeLLMProviderFactory } from './runtimeLLMProvider';

export class AIService {
  private provider: BaseAIProvider;
  private settings: AppSettings['ai'];
  private lastCheckTime = 0;
  private cachedStatus: AIProviderStatus | null = null;
  private inFlightCheck: Promise<AIProviderStatus> | null = null;

  constructor(settings: AppSettings['ai']) {
    this.settings = settings;
    this.provider = this.createProvider(settings.provider, settings.endpoint);
  }

  updateConfig(settings: AppSettings['ai']) {
    this.settings = settings;
    this.provider = this.createProvider(settings.provider, settings.endpoint);
    this.cachedStatus = null;
    this.lastCheckTime = 0;
  }

  private createProvider(type: AIProviderType, endpoint: string): BaseAIProvider {
    return RuntimeLLMProviderFactory.createProvider(type, endpoint);
  }

  getProvider(): AIProvider {
    return this.provider;
  }

  async checkStatus(force = false): Promise<AIProviderStatus> {
    const now = Date.now();
    // Use cached status if valid (positive cache: 30s, negative cache: 5s)
    if (!force && this.cachedStatus) {
      const ttl = this.cachedStatus.isAvailable ? 30000 : 5000;
      if (now - this.lastCheckTime < ttl) {
        return this.cachedStatus;
      }
    }

    // Coalesce concurrent in-flight checks into a single promise
    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    this.inFlightCheck = this.performCheckStatus()
      .then((status) => {
        this.cachedStatus = status;
        this.lastCheckTime = Date.now();
        this.inFlightCheck = null;
        return status;
      })
      .catch((err) => {
        this.inFlightCheck = null;
        throw err;
      });

    return this.inFlightCheck;
  }

  private async performCheckStatus(): Promise<AIProviderStatus> {
    // Keep the configured provider's own report (e.g. "model loading", "model not downloaded") so callers
    // can react to it; the generic "unreachable" status below is only for when nothing better is known.
    let primary: AIProviderStatus | null = null;
    try {
      const status = await this.provider.checkStatus(this.settings.model, this.settings.embeddingModel);
      if (status.isAvailable) {
        return status;
      }
      primary = status;
    } catch {
      // Primary check failed, probe fallback candidates
    }

    const isAndroid =
      (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) ||
      this.settings.provider === 'android_local';

    // On Android production / local mode, Foundry is strictly standalone.
    // Never fall back to PC LAN servers, Ollama, LM Studio, or cloud.
    if (isAndroid) {
      return {
        isAvailable: false,
        providerType: 'android_local',
        endpoint: this.settings.endpoint,
        modelName: this.settings.model,
        embeddingModel: this.settings.embeddingModel,
        errorMessage: 'Local AI model is not installed or ready.',
      };
    }

    // Auto-discovery fallback candidates for desktop environment ONLY (localhost only)
    const fallbackCandidates: { type: AIProviderType; endpoint: string; model: string }[] = [
      { type: 'desktop_local', endpoint: 'http://127.0.0.1:8172', model: 'foundry-desktop-local-model' },
      { type: 'anthropic_local', endpoint: 'http://127.0.0.1:8082', model: 'claude-3-5-sonnet-20241022' },
      { type: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'llama3:latest' },
      { type: 'lmstudio', endpoint: 'http://127.0.0.1:1234', model: 'local-model' },
    ];

    const eligible = fallbackCandidates.filter(
      (c) => !(c.type === this.settings.provider && c.endpoint === this.settings.endpoint)
    );

    // Probe all candidate endpoints concurrently in parallel
    const probeCandidate = async (candidate: (typeof fallbackCandidates)[0]) => {
      try {
        const testProvider = this.createProvider(candidate.type, candidate.endpoint);
        const testStatus = await testProvider.checkStatus(candidate.model, this.settings.embeddingModel);
        if (testStatus.isAvailable) {
          return { candidate, testProvider, testStatus };
        }
      } catch {
        // probe failed
      }
      throw new Error(`Candidate ${candidate.endpoint} unreachable`);
    };

    try {
      const winner = await Promise.any(eligible.map(probeCandidate));
      console.log(`[Foundry AI] Auto-connected to active local LLM at ${winner.candidate.endpoint} (${winner.candidate.type})`);
      this.provider = winner.testProvider;
      this.settings = {
        ...this.settings,
        provider: winner.candidate.type,
        endpoint: winner.candidate.endpoint,
        model: winner.candidate.model,
      };
      return winner.testStatus;
    } catch {
      // All fallback candidates failed
    }

    return (
      primary ?? {
        isAvailable: false,
        providerType: this.settings.provider,
        endpoint: this.settings.endpoint,
        modelName: this.settings.model,
        embeddingModel: this.settings.embeddingModel,
        errorMessage: 'All AI runtime checks timed out or were unreachable',
      }
    );
  }

  async generateRAGAnswer(
    query: string,
    chunks: {
      documentId: string;
      documentTitle: string;
      content: string;
      pageNumber?: number;
      similarityScore?: number;
    }[]
  ): Promise<{ answer: string; citations: Citation[]; insufficientContext: boolean }> {
    if (chunks.length === 0) {
      return {
        answer: "I couldn't find enough information in your indexed knowledge base to answer this question.",
        citations: [],
        insufficientContext: true,
      };
    }

    // Build context with citations
    const citations: Citation[] = chunks.map((c, index) => ({
      id: `cit_${index + 1}`,
      sourceIndex: index + 1,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      pageNumber: c.pageNumber,
      snippet: c.content.slice(0, 200) + (c.content.length > 200 ? '...' : ''),
      similarityScore: c.similarityScore,
    }));

    const contextText = chunks
      .map((c, idx) => `[${idx + 1}] Source: ${c.documentTitle}${c.pageNumber ? ` (Page ${c.pageNumber})` : ''}\n${c.content}`)
      .join('\n\n---\n\n');

    const systemPrompt = `You are Foundry, a local-first personal knowledge assistant.
Answer the user's question using ONLY the provided knowledge context below.
Strict rules:
1. Always cite your sources using bracketed indices like [1], [2] corresponding to the sources provided.
2. If the answer cannot be determined strictly from the provided context, respond with: "I couldn't find enough information in your indexed knowledge."
3. Never fabricate facts, citations, or references not in the context.
4. Keep the answer professional, concise, and structured.`;

    const messages = [
      { role: 'system', content: `${systemPrompt}\n\nContext:\n${contextText}` },
      { role: 'user', content: query },
    ];

    try {
      const answer = await this.provider.chat(messages, {
        model: this.settings.model,
        temperature: this.settings.temperature,
      });

      return {
        answer: answer.trim(),
        citations,
        insufficientContext: false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error communicating with local AI';
      return {
        answer: `AI error: ${msg}. Please ensure your local model provider (${this.provider.name}) is running.`,
        citations: [],
        insufficientContext: true,
      };
    }
  }
}