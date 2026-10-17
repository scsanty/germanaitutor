// app/api/backup/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { getDb, closeDb, getDbPath } from '@/lib/db/client';
import { loadOrCreateMasterKey, defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProfileService } from '@/lib/services/profileService';
import { POST as startPlacement } from '@/app/api/placement/start/route';
import { GET as exportRoute } from './export/route';
import { POST as importRoute } from './import/route';
import { audioDir } from '@/lib/audio/audioStore';
import { decrypt } from '@/lib/crypto/encrypt';
import { readSmtpSettings, saveSmtpSettings } from '@/lib/services/mailService';

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

  const HASH = 'c'.repeat(64);

  function addJob(hash: string, status: string, transcript = 'A: Hallo.') {
    getDb()
      .prepare('INSERT INTO audio_jobs (hash, transcript, status, attempts, updated_at) VALUES (?, ?, ?, 0, ?)')
      .run(hash, transcript, status, new Date().toISOString());
  }
  const jobStatus = (hash: string) =>
    (getDb().prepare('SELECT status FROM audio_jobs WHERE hash = ?').get(hash) as { status: string } | undefined)?.status;

  it('restores the audio files, and an uploaded recording keeps its status', async () => {
    const clip = randomBytes(5000);
    addJob(HASH, 'uploaded');
    mkdirSync(audioDir(), { recursive: true });
    writeFileSync(join(audioDir(), `${HASH}.ogg`), clip);

    const archive = Buffer.from(await (await exportRoute()).arrayBuffer());
    rmSync(audioDir(), { recursive: true });

    const importRes = await importRoute(importRequest(archive));
    expect((await importRes.json()).ok).toBe(true);
    expect(readFileSync(join(audioDir(), `${HASH}.ogg`)).equals(clip)).toBe(true);
    // The post-import sweep found the file, so the recording is not re-queued for synthesis.
    expect(jobStatus(HASH)).toBe('uploaded');
  });

  it('imports a version-1 archive and re-queues audio whose file is missing', async () => {
    addJob(HASH, 'done');
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    const db = readFileSync(getDbPath());
    const key = readFileSync(defaultKeyFilePath());
    const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const v1 = gzipSync(
      Buffer.from(
        JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          db: db.toString('base64'),
          dbHash: sha(db),
          key: key.toString('base64'),
          keyHash: sha(key),
        })
      )
    );

    const importRes = await importRoute(importRequest(v1));
    expect((await importRes.json()).ok).toBe(true);
    expect(existsSync(join(audioDir(), `${HASH}.ogg`))).toBe(false);
    expect(jobStatus(HASH)).toBe('pending');
  });

  it('rejects an archive with an invalid audio file name', async () => {
    const archive = Buffer.from(await (await exportRoute()).arrayBuffer());
    const { gunzipSync } = await import('node:zlib');
    const envelope = JSON.parse(gunzipSync(archive).toString('utf8'));
    envelope.audio = { '../evil.ogg': 'ZXZpbA==' };
    const res = await importRoute(importRequest(gzipSync(Buffer.from(JSON.stringify(envelope)))));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Backup archive has an invalid audio file name');
    expect(existsSync(join(process.env.GAIT_DATA_DIR!, 'evil.ogg'))).toBe(false);
  });

  it('keeps the SMTP password usable after a restore on a machine with another master key', async () => {
    saveSmtpSettings(getDb(), { host: 'smtp.example.com', port: 587, secure: false, user: 'u', password: 's3cret', from: 'a@b.de', to: 'c@d.de' });
    const archive = Buffer.from(await (await exportRoute()).arrayBuffer());

    // A different machine: a fresh data folder with its own master key.
    closeDb();
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-other-'));
    getDb();
    const otherKey = loadOrCreateMasterKey();

    const importRes = await importRoute(importRequest(archive));
    expect((await importRes.json()).ok).toBe(true);
    // The archive carries the master key, so the restore replaces this machine's key with it.
    expect(loadOrCreateMasterKey().equals(otherKey)).toBe(false);
    const smtp = readSmtpSettings(getDb())!;
    expect(decrypt(smtp.passwordEncrypted, loadOrCreateMasterKey())).toBe('s3cret');
  });
});
