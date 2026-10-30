import { AIProviderType } from './ai';

export interface AIConfig {
  provider: AIProviderType;
  endpoint: string;
  model: string;
  embeddingModel: string;
  temperature: number;
}

export interface StorageConfig {
  databasePath: string;
  vectorsPath: string;
  importsPath: string;
  cachePath: string;
}

export interface IndexingConfig {
  chunkSize: number;
  chunkOverlap: number;
  autoIndex: boolean;
  backgroundIndexing: boolean;
  extractConcepts: boolean;
}

export interface AccessibilityConfig {
  theme: 'system' | 'dark' | 'light';
  highContrast: boolean;
  reducedMotion: boolean;
  fontSize: 'normal' | 'large' | 'x-large';
}

export interface AppSettings {
  ai: AIConfig;
  storage: StorageConfig;
  indexing: IndexingConfig;
  accessibility: AccessibilityConfig;
  developerMode?: boolean;
}
