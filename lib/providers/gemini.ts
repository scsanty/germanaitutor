import type {
  ProviderAdapter,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// listModels returns ids like "models/gemini-3.5-flash", and those get saved as the model. The
// generate URL adds its own "models/" segment, so strip a leading one to accept both forms.
export function geminiModelPath(model: string): string {
  return `${API_BASE}/models/${model.replace(/^models\//, '')}`;
}

export function createGeminiAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  return {
    async testConnection(creds, options) {
      const res = await fetchImpl(`${API_BASE}/models?key=${creds.apiKey ?? ''}`);
      if (!res.ok) return { ok: false, error: `Gemini returned ${res.status}` };
      if (!options?.model) return { ok: true };
      // The cheapest real call: a one-word prompt capped at one output token, so a missing or
      // misnamed model shows up here instead of on the learner's first exercise.
      const check = await fetchImpl(`${geminiModelPath(options.model)}:generateContent?key=${creds.apiKey ?? ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
      });
      if (check.ok) return { ok: true };
      return { ok: false, error: `Gemini model ${options.model} returned ${check.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${API_BASE}/models?key=${creds.apiKey ?? ''}`);
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const data = await res.json();
      return (data.models ?? []).map((m: { name: string }) => ({ id: m.name, label: m.name }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(
        `${geminiModelPath(params.model)}:generateContent?key=${creds.apiKey ?? ''}`,
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
