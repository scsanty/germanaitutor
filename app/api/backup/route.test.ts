// app/api/backup/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { GET as exportRoute } from './export/route';
import { POST as importRoute } from './import/route';

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

  it('exports a downloadable archive and re-imports it successfully', async () => {
    const exportRes = await exportRoute();
    const archive = Buffer.from(await exportRes.arrayBuffer());
    expect(archive.length).toBeGreaterThan(0);

    const importRes = await importRoute(
      new Request('http://localhost/api/backup/import', { method: 'POST', body: archive })
    );
    expect((await importRes.json()).ok).toBe(true);
  });

  it('rejects an invalid archive on import', async () => {
    const importRes = await importRoute(
      new Request('http://localhost/api/backup/import', { method: 'POST', body: Buffer.from('garbage') })
    );
    expect(importRes.status).toBe(400);
  });
});
