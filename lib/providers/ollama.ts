import type {
  ProviderAdapter,
  ProviderCredentials,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

export function createOllamaAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  function base(creds: ProviderCredentials): string {
    return creds.host ?? 'http://localhost:11434';
  }

  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${base(creds)}/api/tags`);
      if (res.ok) return { ok: true };
      return { ok: false, error: `Ollama returned ${res.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${base(creds)}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      return (data.models ?? []).map((m: { name: string }) => ({ id: m.name, label: m.name }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(`${base(creds)}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
          model: params.model,
          messages: params.systemPrompt
            ? [{ role: 'system', content: params.systemPrompt }, ...params.messages]
            : params.messages,
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.message?.content ?? '',
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      };
    },
  };
}
