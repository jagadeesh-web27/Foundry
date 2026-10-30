import { AppSettings } from '@/types/settings';

function isAndroidUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && !isAndroidUserAgent();
}

export function getDefaultAIProvider(): 'anthropic_local' | 'android_local' | 'desktop_local' {
  if (isAndroidUserAgent()) return 'android_local';
  // The packaged desktop app ships its own on-device AI engine; plain-browser dev has no engine.
  if (isTauriDesktop()) return 'desktop_local';
  return 'anthropic_local';
}

export function getDefaultAIEndpoint(): string {
  const provider = getDefaultAIProvider();
  if (provider === 'android_local') return 'android-local://';
  if (provider === 'desktop_local') return 'http://127.0.0.1:8172';
  return 'http://127.0.0.1:8082';
}

function getDefaultAIModel(): string {
  const provider = getDefaultAIProvider();
  if (provider === 'android_local') return 'foundry-android-local-model';
  if (provider === 'desktop_local') return 'foundry-desktop-local-model';
  return 'claude-3-5-sonnet-20241022';
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    provider: getDefaultAIProvider(), // Dynamically determine provider based on environment
    endpoint: getDefaultAIEndpoint(),
    model: getDefaultAIModel(),
    embeddingModel: 'nomic-embed-text:latest',
    temperature: 0.2,
  },
  storage: {
    databasePath: 'Foundry/data/knowledge.db',
    vectorsPath: 'Foundry/data/vectors/',
    importsPath: 'Foundry/storage/documents/',
    cachePath: 'Foundry/cache/',
  },
  indexing: {
    chunkSize: 512,
    chunkOverlap: 64,
    autoIndex: true,
    backgroundIndexing: true,
    extractConcepts: true,
  },
  accessibility: {
    theme: 'dark',
    highContrast: false,
    reducedMotion: false,
    fontSize: 'normal',
  },
  developerMode: false,
};