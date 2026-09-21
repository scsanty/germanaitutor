import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateTextMock = vi.fn();
vi.mock('../providers/registry', () => ({
  getAdapter: () => ({ generateText: generateTextMock, testConnection: vi.fn(), listModels: vi.fn() }),
}));

import { createGenerationAiClient } from './aiClient';

describe('createGenerationAiClient', () => {
  beforeEach(() => {
    process.env.CURRICULUM_GEN_PROVIDER = 'anthropic';
    process.env.CURRICULUM_GEN_MODEL = 'claude-sonnet-5';
    process.env.CURRICULUM_GEN_API_KEY = 'sk-test';
  });

  afterEach(() => {
    delete process.env.CURRICULUM_GEN_PROVIDER;
    delete process.env.CURRICULUM_GEN_MODEL;
    delete process.env.CURRICULUM_GEN_API_KEY;
    vi.clearAllMocks();
  });

  it('parses a clean JSON response', async () => {
    generateTextMock.mockResolvedValue({ text: '{"concepts": []}' });
    const client = createGenerationAiClient();
    const result = await client.generateJSON('system', 'user');
    expect(result).toEqual({ concepts: [] });
  });

  it('strips markdown code fences before parsing', async () => {
    generateTextMock.mockResolvedValue({ text: '```json\n{"concepts": []}\n```' });
    const client = createGenerationAiClient();
    const result = await client.generateJSON('system', 'user');
    expect(result).toEqual({ concepts: [] });
  });

  it('throws a clear error on invalid JSON', async () => {
    generateTextMock.mockResolvedValue({ text: 'not json' });
    const client = createGenerationAiClient();
    await expect(client.generateJSON('system', 'user')).rejects.toThrow('Failed to parse AI response as JSON');
  });

  it('throws when required env vars are missing', async () => {
    delete process.env.CURRICULUM_GEN_PROVIDER;
    const client = createGenerationAiClient();
    await expect(client.generateJSON('system', 'user')).rejects.toThrow(
      'CURRICULUM_GEN_PROVIDER and CURRICULUM_GEN_MODEL environment variables are required'
    );
  });
});
