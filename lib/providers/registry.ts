import type { ProviderAdapter } from './types';
import type { ProviderType } from '../types';
import { createAnthropicAdapter } from './anthropic';
import { createOpenAIAdapter } from './openai';
import { createGeminiAdapter } from './gemini';
import { createOllamaAdapter } from './ollama';

export function getAdapter(providerType: ProviderType): ProviderAdapter {
  switch (providerType) {
    case 'anthropic':
      return createAnthropicAdapter();
    case 'openai':
      return createOpenAIAdapter();
    case 'gemini':
      return createGeminiAdapter();
    case 'ollama':
      return createOllamaAdapter();
  }
}
