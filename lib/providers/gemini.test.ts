// lib/providers/gemini.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createGeminiAdapter } from './gemini';

describe('createGeminiAdapter', () => {
  it('reports ok when the models endpoint returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'gm-test' });
    expect(result).toEqual({ ok: true });
  });

  it('reports the status code on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'bad-key' });
    expect(result).toEqual({ ok: false, error: 'Gemini returned 400' });
  });

  it('extracts text and token usage from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hallo!' }] } }],
        usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 3 },
      }),
    });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.generateText(
      { apiKey: 'gm-test' },
      { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 6, outputTokens: 3 });
  });
});
