// app/api/profile/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb, getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { GET, PATCH } from './route';

describe('/api/profile', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('GET returns the default profile', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.activeTrack).toBe('generic');
  });

  it('PATCH updates and returns the new profile', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ activeTrack: 'telc' }),
      })
    );
    const body = await res.json();
    expect(body.activeTrack).toBe('telc');
  });

  it('PATCH rejects a locked level with 400', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify({ activeLevel: 'B2' }) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Level B2 is locked', code: 'level_locked', params: { level: 'B2' } });
  });

  it('PATCH rejects an unknown level with 400', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify({ activeLevel: 'Z9' }) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Level Z9 is locked', code: 'level_locked', params: { level: 'Z9' } });
  });

  it('PATCH accepts an unlocked level', async () => {
    createProfileService(getDb()).writeLevelState({ highestUnlockedLevel: 'B2' });
    const res = await PATCH(
      new Request('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify({ activeLevel: 'B2' }) })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).activeLevel).toBe('B2');
  });

  it('PATCH returns 400 for an invalid daily review limit', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ dailyReviewCap: 0 }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The daily review limit must be a whole number from 1 to 500', code: 'invalid_daily_cap' });
  });

  it('PATCH saves a valid daily review limit', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ dailyReviewCap: 25 }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).dailyReviewCap).toBe(25);
  });

  it('PATCH saves valid deck settings', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ newWordsPerDay: 0, deckReviewCap: 500 }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ newWordsPerDay: 0, deckReviewCap: 500 });
  });

  it('PATCH returns 400 with a specific code for out-of-range deck settings', async () => {
    const words = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ newWordsPerDay: 51 }) }));
    expect(words.status).toBe(400);
    expect(await words.json()).toEqual({ error: 'New words per day must be a whole number from 0 to 50', code: 'invalid_new_words_per_day' });
    const cap = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ deckReviewCap: 501 }) }));
    expect(cap.status).toBe(400);
    expect(await cap.json()).toEqual({ error: 'The flashcard review limit must be a whole number from 1 to 500', code: 'invalid_deck_review_cap' });
  });

  it('PATCH rejects a sound setting that is not true or false with 400 and does not store it', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ soundEnabled: 'false' }) }));
    expect(res.status).toBe(400);
    // Sound defaults to on and stays on.
    expect((await GET().then((r) => r.json())).soundEnabled).toBe(true);
  });

  it('PATCH rejects an unknown theme with 400 and does not store it', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ theme: 'neon' }) }));
    expect(res.status).toBe(400);
    expect((await GET().then((r) => r.json())).theme).toBe('dark');
  });
});
