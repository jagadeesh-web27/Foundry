/**
 * Foundry Runtime LLM Provider Abstraction
 * Unifies CloudProvider (packaged zero-dependency runtime) and LocalProvider (Ollama, LM Studio)
 */

/* eslint-disable max-lines-per-function */
import { BaseAIProvider } from './aiProvider';
import { CloudProvider } from './cloudProvider';
import { OllamaProvider } from './ollamaProvider';
import { LMStudioProvider } from './lmStudioProvider';
import { LocalAnthropicProvider } from './localAnthropicProvider';
import { AndroidLocalAIProvider } from './androidLocalProvider';
import { DesktopLocalAIProvider } from './desktopLocalProvider';
import { AIProviderType } from '@/types/ai';

export interface ProviderInfo {
  type: AIProviderType;
  category: 'cloud' | 'local';
  name: string;
  description: string;
  isPackagedDefault: boolean;
}

export const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  {
    type: 'cloud',
    category: 'cloud',
    name: 'Foundry Cloud Assistant (Recommended)',
    description: 'Packaged zero-dependency AI engine. Works immediately out of the box without any local server setup.',
    isPackagedDefault: true,
  },
  {
    type: 'android_local',
    category: 'local',
    name: 'Foundry On-Device AI (Android)',
    description: 'Runs AI inference entirely on the Android device without requiring laptop, PC, Wi-Fi, or cloud.',
    isPackagedDefault: typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent),
  },
  {
    type: 'desktop_local',
    category: 'local',
    name: 'Foundry On-Device AI (Desktop)',
    description: 'Runs a bundled local model inside Foundry. No Ollama, LM Studio, internet or account needed after the one-time model download.',
    isPackagedDefault: typeof navigator !== 'undefined' && !/android/i.test(navigator.userAgent),
  },
  {
    type: 'anthropic_local',
    category: 'local',
    name: 'Local Anthropic Runtime (Port 8082)',
    description: 'Connects to a local Claude-compatible model runtime on port 8082.',
    isPackagedDefault: false,
  },
  {
    type: 'ollama',
    category: 'local',
    name: 'Ollama (Port 11434)',
    description: 'Connects to locally running Ollama models (e.g. Llama 3, Mistral).',
    isPackagedDefault: false,
  },
  {
    type: 'lmstudio',
    category: 'local',
    name: 'LM Studio (Port 1234)',
    description: 'Connects to locally running LM Studio OpenAI-compatible server.',
    isPackagedDefault: false,
  },
  {
    type: 'llamacpp',
    category: 'local',
    name: 'llama.cpp Server',
    description: 'Connects to a native llama.cpp server instance.',
    isPackagedDefault: false,
  },
];

export class RuntimeLLMProviderFactory {
  public static createProvider(type: AIProviderType, endpoint: string): BaseAIProvider {
    switch (type) {
      case 'cloud':
        return new CloudProvider(endpoint);
      case 'android_local':
        return new AndroidLocalAIProvider(endpoint);
      case 'desktop_local':
        return new DesktopLocalAIProvider(endpoint);
      case 'anthropic_local':
        return new LocalAnthropicProvider(endpoint);
      case 'lmstudio':
      case 'llamacpp':
        return new LMStudioProvider(endpoint);
      case 'ollama':
      default:
        return new OllamaProvider(endpoint);
    }
  }
}