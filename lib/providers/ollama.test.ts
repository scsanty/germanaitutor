// lib/providers/ollama.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOllamaAdapter } from './ollama';

describe('createOllamaAdapter', () => {
  it('defaults to localhost:11434 when no host is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createOllamaAdapter(fetchImpl);
    await adapter.testConnection({});
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:11434/api/tags');
  });

  it('uses a custom host when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    const adapter = createOllamaAdapter(fetchImpl);
    const result = await adapter.testConnection({ host: 'http://192.168.1.20:11434' });
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:11434/api/tags');
    expect(result).toEqual({ ok: false, error: 'Ollama returned 502' });
  });

  it('extracts text and eval counts from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { content: 'Hallo!' }, prompt_eval_count: 7, eval_count: 2 }),
    });
    const adapter = createOllamaAdapter(fetchImpl);
    const result = await adapter.generateText(
      {},
      { model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 7, outputTokens: 2 });
  });
});
