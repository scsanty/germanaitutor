import { getAdapter } from '../providers/registry';
import type { ProviderType } from '../types';

function readEnvCredentials(): { providerType: ProviderType; apiKey?: string; host?: string; model: string } {
  const providerType = process.env.CURRICULUM_GEN_PROVIDER as ProviderType | undefined;
  const model = process.env.CURRICULUM_GEN_MODEL;
  if (!providerType || !model) {
    throw new Error('CURRICULUM_GEN_PROVIDER and CURRICULUM_GEN_MODEL environment variables are required');
  }
  return {
    providerType,
    apiKey: process.env.CURRICULUM_GEN_API_KEY,
    host: process.env.CURRICULUM_GEN_OLLAMA_HOST,
    model,
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```[a-z]*\n/, '').replace(/```$/, '').trim();
  }
  return trimmed;
}

export function createGenerationAiClient() {
  async function generateJSON(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const { providerType, apiKey, host, model } = readEnvCredentials();
    const adapter = getAdapter(providerType);
    const result = await adapter.generateText(
      { apiKey, host },
      { model, systemPrompt, messages: [{ role: 'user', content: userPrompt }] }
    );
    const cleaned = stripMarkdownFences(result.text);
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Failed to parse AI response as JSON: ${(error as Error).message}\nResponse was: ${cleaned}`);
    }
  }

  return { generateJSON };
}

export type GenerationAiClient = ReturnType<typeof createGenerationAiClient>;
