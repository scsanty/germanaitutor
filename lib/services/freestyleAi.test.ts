import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';

vi.mock('./aiService', () => ({
  generateWithActiveProvider: vi.fn(async () => ({ ok: true, text: 'nonsense' })),
}));

import { normalizeWord } from './freestyleAi';

// M1
describe('normalizeWord', () => {
  it('turns a reply it cannot parse into ai_bad_reply', async () => {
    const db = createDbClient(':memory:');
    expect(await normalizeWord(db, 'Hund', null)).toMatchObject({ ok: false, code: 'ai_bad_reply' });
  });
});
