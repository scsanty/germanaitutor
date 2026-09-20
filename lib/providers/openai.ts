import type {
  ProviderAdapter,
  ProviderCredentials,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://api.openai.com/v1';

export function createOpenAIAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  function headers(creds: ProviderCredentials): HeadersInit {
    return {
      Authorization: `Bearer ${creds.apiKey ?? ''}`,
      'content-type': 'application/json',
    };
  }

  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${API_BASE}/models`, { headers: headers(creds) });
      if (res.ok) return { ok: true };
      return { ok: false, error: `OpenAI returned ${res.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${API_BASE}/models`, { headers: headers(creds) });
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
      const data = await res.json();
      return (data.data ?? []).map((m: { id: string }) => ({ id: m.id, label: m.id }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: headers(creds),
        body: JSON.stringify({
          model: params.model,
          messages: params.systemPrompt
            ? [{ role: 'system', content: params.systemPrompt }, ...params.messages]
            : params.messages,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    },
  };
}
