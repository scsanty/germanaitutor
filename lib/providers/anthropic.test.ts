// lib/providers/anthropic.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAnthropicAdapter } from './anthropic';

describe('createAnthropicAdapter', () => {
  it('reports ok when the models endpoint returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createAnthropicAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'sk-ant-test' });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }) })
    );
  });

  it('reports the status code on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const adapter = createAnthropicAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'bad-key' });
    expect(result).toEqual({ ok: false, error: 'Anthropic returned 401' });
  });

  it('extracts text and token usage from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'Hallo!' }], usage: { input_tokens: 10, output_tokens: 5 } }),
    });
    const adapter = createAnthropicAdapter(fetchImpl);
    const result = await adapter.generateText(
      { apiKey: 'sk-ant-test' },
      { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 10, outputTokens: 5 });
  });
});
