export type AIProviderType = 'cloud' | 'ollama' | 'lmstudio' | 'llamacpp' | 'anthropic_local' | 'custom' | 'android_local' | 'desktop_local';

export type DesktopAIProviderState =
  | 'NOT_INSTALLED'
  | 'DETECTING'
  | 'AVAILABLE'
  | 'MODEL_MISSING'
  | 'MODEL_LOADING'
  | 'READY'
  | 'ERROR';

export interface AIProviderStatus {
	isAvailable: boolean;
	providerType: AIProviderType;
	endpoint: string;
	modelName: string;
	embeddingModel: string;
	latencyMs?: number;
	errorMessage?: string;
	state?: DesktopAIProviderState;
	installedModels?: string[];
}

export interface Citation {
	id: string;
	sourceIndex: number;
	documentId: string;
	documentTitle: string;
	pageNumber?: number;
	snippet?: string;
	similarityScore?: number;
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: string;
	citations?: Citation[];
	insufficientContext?: boolean;
}

export interface AIProvider {
	type: AIProviderType;
	name: string;
	isAvailable(): Promise<boolean>;
	listModels(): Promise<string[]>;
	chat(messages: { role: string; content: string }[], options?: { stream?: boolean; model?: string; temperature?: number; tools?: any[] }): Promise<string>;
	streamChat(messages: { role: string; content: string }[], options?: { model?: string; temperature?: number; tools?: any[] }): AsyncIterable<any>;
	supportsTools(): boolean;
	getModelInfo(): Promise<{ name: string; version?: string; parameters?: string }>;
	embed(text: string, model?: string): Promise<number[]>;
	embedBatch(texts: string[], model?: string): Promise<number[][]>;
}