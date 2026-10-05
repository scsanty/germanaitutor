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

  it.each(['gemini-3.5-flash', 'models/gemini-3.5-flash'])('builds a single models/ prefix in the generate URL for %s', async (model) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [] }) });
    const adapter = createGeminiAdapter(fetchImpl);
    await adapter.generateText({ apiKey: 'gm-test' }, { model, messages: [{ role: 'user', content: 'Hi' }] });
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toContain('/v1beta/models/gemini-3.5-flash:generateContent');
    expect(url).not.toContain('models/models/');
  });

  it('checks the configured model with a one-token generate call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'gm-test' }, { model: 'models/gemini-3.5-flash' });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.5-flash:generateContent');
    expect(url).not.toContain('models/models/');
    expect(JSON.parse(String(init.body)).generationConfig).toEqual({ maxOutputTokens: 1 });
  });

  it('fails the connection test when the model call 404s', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'gm-test' }, { model: 'gemini-gone' });
    expect(result).toEqual({ ok: false, error: 'Gemini model gemini-gone returned 404' });
  });

  it('only lists models when no model is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    await adapter.testConnection({ apiKey: 'gm-test' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
