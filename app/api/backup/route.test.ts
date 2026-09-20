// app/api/backup/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb, getDbPath } from '@/lib/db/client';
import { loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { createProfileService } from '@/lib/services/profileService';
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

    // Sidecars from the replaced DB must be gone, or they get replayed on open.
    expect(existsSync(`${getDbPath()}-wal`)).toBe(false);
    expect(existsSync(`${getDbPath()}-shm`)).toBe(false);

    closeDb();
    expect(createProfileService(getDb()).getProfile().displayName).toBe('roundtrip-test');
  });

  it('rejects an invalid archive on import', async () => {
    const importRes = await importRoute(importRequest(Buffer.from('garbage')));
    expect(importRes.status).toBe(400);
  });
});
