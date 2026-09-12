import { GeminiProvider } from './gemini-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export function createAIProvider(config) {
  const providerType = (config?.ai?.provider || 'gemini').toLowerCase().trim();

  switch (providerType) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'openai_compatible':
    case 'openai-compatible':
    case 'tooken':
    case 'ollama':
      return new OpenAICompatibleProvider(config);
    default:
      throw new Error(`Unknown AI provider: ${config.ai.provider}. Supported providers: ollama, gemini, openai, openai_compatible`);
  }
}
