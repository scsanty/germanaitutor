import type {
  ProviderAdapter,
  ProviderCredentials,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://api.anthropic.com/v1';
const KNOWN_MODELS: ModelInfo[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

export function createAnthropicAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  function headers(creds: ProviderCredentials): HeadersInit {
    return {
      'x-api-key': creds.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${API_BASE}/models`, { headers: headers(creds) });
      if (res.ok) return { ok: true };
      return { ok: false, error: `Anthropic returned ${res.status}` };
    },
    async listModels() {
      return KNOWN_MODELS;
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(`${API_BASE}/messages`, {
        method: 'POST',
        headers: headers(creds),
        body: JSON.stringify({
          model: params.model,
          system: params.systemPrompt,
          messages: params.messages,
          max_tokens: 1024,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.content?.[0]?.text ?? '',
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      };
    },
  };
}
