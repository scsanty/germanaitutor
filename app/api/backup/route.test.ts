// app/api/backup/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { createProfileService } from '@/lib/services/profileService';
import { POST as startPlacement } from '@/app/api/placement/start/route';
import { GET as exportRoute } from './export/route';
import { POST as importRoute } from './import/route';

function importRequest(archive: Buffer): Request {
  return new Request('http://localhost/api/backup/import', {
    method: 'POST',
    body: new Uint8Array(archive),
  });
}

describe('/api/backup', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    getDb();
    loadOrCreateMasterKey();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('round-trips real data through export and import', async () => {
    // Written through the live WAL-mode connection: this row lives in the `-wal`
    // sidecar, not in `app.db`, until something checkpoints it.
    createProfileService(getDb()).updateProfile({ displayName: 'roundtrip-test' });

    const exportRes = await exportRoute();
    const archive = Buffer.from(await exportRes.arrayBuffer());
    expect(archive.length).toBeGreaterThan(0);

    // Clobber the saved value so a no-op import cannot pass by accident.
    createProfileService(getDb()).updateProfile({ displayName: 'clobbered' });
    expect(createProfileService(getDb()).getProfile().displayName).toBe('clobbered');

    const importRes = await importRoute(importRequest(archive));
    expect((await importRes.json()).ok).toBe(true);

    // The route reopens the DB itself (to reload the bundled seeds, I-1), so the
    // restored data is already visible without the test opening it again — proof
    // that the pre-import 'clobbered' WAL sidecar was not replayed over it.
    expect(createProfileService(getDb()).getProfile().displayName).toBe('roundtrip-test');

    closeDb();
    expect(createProfileService(getDb()).getProfile().displayName).toBe('roundtrip-test');
  });

  it('rejects an invalid archive on import', async () => {
    const importRes = await importRoute(importRequest(Buffer.from('garbage')));
    expect(importRes.status).toBe(400);
  });

  it('reloads the bundled placement exam after restoring a backup with an empty one', async () => {
    // getDb() in beforeEach never loads the bundled seeds (that's layout/reset's job),
    // so this exported archive stands in for an old backup with an empty placement table.
    const exportRes = await exportRoute();
    const archive = Buffer.from(await exportRes.arrayBuffer());

    const importRes = await importRoute(importRequest(archive));
    expect((await importRes.json()).ok).toBe(true);

    const res = await startPlacement();
    expect(res.status).toBe(200);
  });
});
