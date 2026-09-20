import type {
  ProviderAdapter,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function createGeminiAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${API_BASE}/models?key=${creds.apiKey ?? ''}`);
      if (res.ok) return { ok: true };
      return { ok: false, error: `Gemini returned ${res.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${API_BASE}/models?key=${creds.apiKey ?? ''}`);
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const data = await res.json();
      return (data.models ?? []).map((m: { name: string }) => ({ id: m.name, label: m.name }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(
        `${API_BASE}/models/${params.model}:generateContent?key=${creds.apiKey ?? ''}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: params.systemPrompt
              ? { parts: [{ text: params.systemPrompt }] }
              : undefined,
            contents: params.messages.map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}
