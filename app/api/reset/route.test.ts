import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath, loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { POST } from './route';

describe('/api/reset', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    getDb();
    loadOrCreateMasterKey();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('deletes the database and master key files', async () => {
    expect(existsSync(getDbPath())).toBe(true);
    expect(existsSync(defaultKeyFilePath())).toBe(true);

    const res = await POST();
    expect((await res.json()).ok).toBe(true);
    expect(existsSync(getDbPath())).toBe(false);
    expect(existsSync(defaultKeyFilePath())).toBe(false);
  });
});
