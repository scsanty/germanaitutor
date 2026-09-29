import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProviderService } from './providerService';
import { createUsageService } from './usageService';
import { generateWithActiveProvider } from './aiService';

vi.mock('../providers/registry', () => ({ getAdapter: vi.fn() }));
import { getAdapter } from '../providers/registry';

function setup() {
  const db = createDbClient(':memory:');
  const keyFilePath = join(mkdtempSync(join(tmpdir(), 'gait-ai-')), 'master.key');
  const providers = createProviderService(db, keyFilePath);
  return { db, keyFilePath, providers };
}

const request = { systemPrompt: 'sys', messages: [{ role: 'user' as const, content: 'question' }] };

describe('generateWithActiveProvider', () => {
  beforeEach(() => {
    vi.mocked(getAdapter).mockReset();
  });

  it('returns an error when no provider is active', async () => {
    const { db, keyFilePath } = setup();
    expect(await generateWithActiveProvider(db, request, keyFilePath)).toEqual({
      ok: false,
      error: 'No AI provider is set up',
      code: 'no_provider',
    });
  });

  it('returns an error when the active provider has no model selected', async () => {
    const { db, keyFilePath, providers } = setup();
    const connection = providers.createConnection({ providerType: 'anthropic', apiKey: 'sk-test' });
    providers.setActiveConnection(connection.id);
    expect(await generateWithActiveProvider(db, request, keyFilePath)).toEqual({
      ok: false,
      error: 'The active AI provider has no model selected',
      code: 'no_model',
    });
  });

  it('calls the active provider with its model and key, and records usage', async () => {
    const { db, keyFilePath, providers } = setup();
    const connection = providers.createConnection({ providerType: 'anthropic', apiKey: 'sk-test', selectedModel: 'model-x' });
    providers.setActiveConnection(connection.id);
    const generateText = vi.fn().mockResolvedValue({ text: 'hello', inputTokens: 10, outputTokens: 5 });
    vi.mocked(getAdapter).mockReturnValue({ testConnection: vi.fn(), listModels: vi.fn(), generateText });

    const result = await generateWithActiveProvider(db, request, keyFilePath);

    expect(result).toEqual({ ok: true, text: 'hello' });
    expect(generateText).toHaveBeenCalledWith(
      { apiKey: 'sk-test', host: undefined },
      { model: 'model-x', systemPrompt: 'sys', messages: request.messages }
    );
    expect(createUsageService(db).getUsageForDate(connection.id)).toEqual({ requestCount: 1, tokenCount: 15 });
    expect(providers.getConnection(connection.id)?.lastValidatedStatus).toBe('valid');
  });

  it('records the failure on the connection and returns the error when the call throws', async () => {
    const { db, keyFilePath, providers } = setup();
    const connection = providers.createConnection({ providerType: 'anthropic', apiKey: 'sk-test', selectedModel: 'model-x' });
    providers.setActiveConnection(connection.id);
    const generateText = vi.fn().mockRejectedValue(new Error('Anthropic returned 429'));
    vi.mocked(getAdapter).mockReturnValue({ testConnection: vi.fn(), listModels: vi.fn(), generateText });

    expect(await generateWithActiveProvider(db, request, keyFilePath)).toEqual({
      ok: false,
      error: 'Anthropic returned 429',
      code: 'ai_failed',
      params: { detail: 'Anthropic returned 429' },
    });
    expect(providers.getConnection(connection.id)).toMatchObject({
      lastValidatedStatus: 'failing',
      lastError: 'Anthropic returned 429',
    });
  });
});
