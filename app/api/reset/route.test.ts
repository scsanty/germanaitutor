import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath, loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { loadBundledSeeds } from '@/lib/services/bundledSeeds';
import { createProfileService } from '@/lib/services/profileService';
import { POST as startPlacement } from '@/app/api/placement/start/route';
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

  it('deletes the master key and starts a fresh database in its place', async () => {
    expect(existsSync(getDbPath())).toBe(true);
    expect(existsSync(defaultKeyFilePath())).toBe(true);
    createProfileService(getDb()).updateProfile({ displayName: 'before-reset' });

    const res = await POST();
    expect((await res.json()).ok).toBe(true);
    // The master key is gone and never recreated by reset.
    expect(existsSync(defaultKeyFilePath())).toBe(false);
    // The DB file exists again only because loadBundledSeeds (via getDb()) rebuilds it;
    // it is a fresh database, not the one that held 'before-reset'.
    expect(existsSync(getDbPath())).toBe(true);
    expect(createProfileService(getDb()).getProfile().displayName).toBe('');
  });

  it('reloads the bundled placement exam, so the test can start again right after reset', async () => {
    loadBundledSeeds(getDb());

    await POST();

    const res = await startPlacement();
    expect(res.status).toBe(200);
  });
});
