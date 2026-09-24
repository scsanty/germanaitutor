import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createUnlockService } from '@/lib/services/unlockService';
import { POST } from './route';

function post(body: unknown) {
  return POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/tutoring/unlock-notice', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-unlock-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('switches to the unlocked level', async () => {
    createUnlockService(getDb()).raiseUnlockedLevel('A2', { notify: true });
    const res = await post({ action: 'switch' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ activeLevel: 'A2', unlockNoticeLevel: null });
  });

  it('dismisses the notice', async () => {
    createUnlockService(getDb()).raiseUnlockedLevel('A2', { notify: true });
    const res = await post({ action: 'dismiss' });
    expect(await res.json()).toMatchObject({ activeLevel: 'A1', unlockNoticeLevel: null });
  });

  it('rejects an unknown action', async () => {
    const res = await post({ action: 'maybe' });
    expect(res.status).toBe(400);
  });
});
