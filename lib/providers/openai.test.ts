// lib/providers/openai.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOpenAIAdapter } from './openai';

describe('createOpenAIAdapter', () => {
  it('reports ok when the models endpoint returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createOpenAIAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'sk-test' });
    expect(result).toEqual({ ok: true });
  });

  it('reports the status code on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const adapter = createOpenAIAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'bad-key' });
    expect(result).toEqual({ ok: false, error: 'OpenAI returned 403' });
  });

  it('extracts text and token usage from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hallo!' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      }),
    });
    const adapter = createOpenAIAdapter(fetchImpl);
    const result = await adapter.generateText(
      { apiKey: 'sk-test' },
      { model: 'gpt-5', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 8, outputTokens: 4 });
  });
});
