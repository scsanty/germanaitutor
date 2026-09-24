import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';

vi.mock('./aiService', () => ({ generateWithActiveProvider: vi.fn() }));
import { generateWithActiveProvider } from './aiService';
import { gradeFreeText } from './freeTextGradingService';

const input = {
  prompt: 'Write.',
  modelAnswer: 'Ich schreibe.',
  studentAnswer: 'Ich schreib.',
  level: 'A2' as const,
  uiLanguage: 'en' as const,
};

describe('gradeFreeText', () => {
  it('returns the parsed grade', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: '{"result":"almost","feedback":"Ending."}' });
    expect(await gradeFreeText(createDbClient(':memory:'), input)).toEqual({
      ok: true,
      result: 'almost',
      feedback: 'Ending.',
    });
  });

  it('treats an unexpected reply as a failure', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: 'Looks good!' });
    expect(await gradeFreeText(createDbClient(':memory:'), input)).toEqual({
      ok: false,
      error: 'The AI replied in an unexpected format',
    });
  });

  it('passes through a provider failure', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: false, error: 'No AI provider is set up' });
    expect(await gradeFreeText(createDbClient(':memory:'), input)).toEqual({
      ok: false,
      error: 'No AI provider is set up',
    });
  });
});
