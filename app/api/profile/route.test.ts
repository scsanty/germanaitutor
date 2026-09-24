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
    expect(await res.json()).toEqual({ error: 'Level B2 is locked' });
  });

  it('PATCH accepts an unlocked level', async () => {
    createProfileService(getDb()).writeLevelState({ highestUnlockedLevel: 'B2' });
    const res = await PATCH(
      new Request('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify({ activeLevel: 'B2' }) })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).activeLevel).toBe('B2');
  });
});
