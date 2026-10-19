// lib/services/backupService.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { BackupTooLargeError, exportBackup, importBackup, InvalidBackupError, MAX_BACKUP_JSON_BYTES } from './backupService';

const HASH_A = 'a'.repeat(64);
const HASH_B = '0123456789abcdef'.repeat(4);

function setupFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'gait-backup-'));
  const dbPath = join(dir, 'app.db');
  const keyPath = join(dir, 'master.key');
  const audioDir = join(dir, 'audio');
  writeFileSync(dbPath, 'fake-db-contents');
  writeFileSync(keyPath, 'fake-key-contents');
  return { dbPath, keyPath, audioDir };
}

function restoreTarget() {
  const dir = mkdtempSync(join(tmpdir(), 'gait-restore-'));
  return { restoredDb: join(dir, 'app.db'), restoredKey: join(dir, 'master.key'), restoredAudio: join(dir, 'audio') };
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

function envelopeOf(archive: Buffer): Record<string, unknown> {
  return JSON.parse(gunzipSync(archive).toString('utf8'));
}

function regzip(envelope: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));
}

// A version-1 archive, built exactly the way the v1 exporter did (whole-buffer gzip, no audio).
function v1Archive(db: Buffer, key: Buffer): Buffer {
  return regzip({
    version: 1,
    exportedAt: new Date().toISOString(),
    db: db.toString('base64'),
    dbHash: sha256(db),
    key: key.toString('base64'),
    keyHash: sha256(key),
  });
}

describe('backupService', () => {
  it('round-trips db and key contents through export/import', async () => {
    const { dbPath, keyPath } = setupFiles();
    const archive = await exportBackup(dbPath, keyPath);

    const { restoredDb, restoredKey } = restoreTarget();
    importBackup(archive, restoredDb, restoredKey);

    expect(readFileSync(restoredDb, 'utf8')).toBe('fake-db-contents');
    expect(readFileSync(restoredKey, 'utf8')).toBe('fake-key-contents');
  });

  it('writes a version-2 envelope with the audio map', async () => {
    const { dbPath, keyPath, audioDir } = setupFiles();
    mkdirSync(audioDir);
    writeFileSync(join(audioDir, `${HASH_A}.ogg`), 'clip');
    // Not audio cache files: temp files, other extensions, upper-case hashes.
    writeFileSync(join(audioDir, `${HASH_A}.123.abc.tmp`), 'partial');
    writeFileSync(join(audioDir, 'notes.txt'), 'x');
    // (A different hash from HASH_A: the filesystem may be case-insensitive.)
    writeFileSync(join(audioDir, `${'B'.repeat(64)}.ogg`), 'x');

    const envelope = envelopeOf(await exportBackup(dbPath, keyPath, audioDir));
    expect(envelope.version).toBe(2);
    expect(envelope.audio).toEqual({ [`${HASH_A}.ogg`]: Buffer.from('clip').toString('base64') });
    expect(Buffer.from(envelope.db as string, 'base64').toString()).toBe('fake-db-contents');
  });

  it('exports an empty audio map without an audio directory', async () => {
    const { dbPath, keyPath, audioDir } = setupFiles();
    expect(envelopeOf(await exportBackup(dbPath, keyPath)).audio).toEqual({});
    expect(envelopeOf(await exportBackup(dbPath, keyPath, audioDir)).audio).toEqual({});
  });

  it('restores two audio files byte for byte from a version-2 archive', async () => {
    const { dbPath, keyPath, audioDir } = setupFiles();
    mkdirSync(audioDir);
    const clipA = randomBytes(300_000);
    const clipB = randomBytes(1234);
    writeFileSync(join(audioDir, `${HASH_A}.ogg`), clipA);
    writeFileSync(join(audioDir, `${HASH_B}.ogg`), clipB);

    const archive = await exportBackup(dbPath, keyPath, audioDir);
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    importBackup(archive, restoredDb, restoredKey, restoredAudio);

    expect(readFileSync(restoredDb, 'utf8')).toBe('fake-db-contents');
    expect(readFileSync(join(restoredAudio, `${HASH_A}.ogg`)).equals(clipA)).toBe(true);
    expect(readFileSync(join(restoredAudio, `${HASH_B}.ogg`)).equals(clipB)).toBe(true);
    expect(readdirSync(restoredAudio).sort()).toEqual([`${HASH_B}.ogg`, `${HASH_A}.ogg`].sort());
  });

  it('streams hundreds of audio files through one archive (Review Focus 5)', async () => {
    const { dbPath, keyPath, audioDir } = setupFiles();
    mkdirSync(audioDir);
    const clips = new Map<string, Buffer>();
    for (let i = 0; i < 300; i += 1) {
      const name = `${sha256(Buffer.from(String(i)))}.ogg`;
      const clip = randomBytes(2000 + i);
      clips.set(name, clip);
      writeFileSync(join(audioDir, name), clip);
    }
    const archive = await exportBackup(dbPath, keyPath, audioDir);
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    importBackup(archive, restoredDb, restoredKey, restoredAudio);
    expect(readdirSync(restoredAudio)).toHaveLength(300);
    for (const [name, clip] of clips) expect(readFileSync(join(restoredAudio, name)).equals(clip)).toBe(true);
  });

  it('still imports a version-1 archive, which has no audio', () => {
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    // An audio file already on this machine is left alone: v1 says nothing about audio.
    mkdirSync(restoredAudio);
    writeFileSync(join(restoredAudio, `${HASH_A}.ogg`), 'kept');

    importBackup(v1Archive(Buffer.from('v1-db'), Buffer.from('v1-key')), restoredDb, restoredKey, restoredAudio);

    expect(readFileSync(restoredDb, 'utf8')).toBe('v1-db');
    expect(readFileSync(restoredKey, 'utf8')).toBe('v1-key');
    expect(readFileSync(join(restoredAudio, `${HASH_A}.ogg`), 'utf8')).toBe('kept');
  });

  it('rejects a version-1 archive that carries an audio map', () => {
    const envelope = envelopeOf(v1Archive(Buffer.from('db'), Buffer.from('key')));
    envelope.audio = {};
    const { restoredDb, restoredKey } = restoreTarget();
    expect(() => importBackup(regzip(envelope), restoredDb, restoredKey)).toThrow(InvalidBackupError);
  });

  it('rejects an unknown version', async () => {
    const { dbPath, keyPath } = setupFiles();
    const envelope = envelopeOf(await exportBackup(dbPath, keyPath));
    envelope.version = 3;
    const { restoredDb, restoredKey } = restoreTarget();
    expect(() => importBackup(regzip(envelope), restoredDb, restoredKey)).toThrow('Unsupported backup version 3');
  });

  it.each([
    '../evil.ogg',
    `../${HASH_A}.ogg`,
    `sub/${HASH_A}.ogg`,
    `${HASH_A}.OGG`,
    `${'A'.repeat(64)}.ogg`,
    `${HASH_A}.ogg/`,
    `${HASH_A.slice(1)}.ogg`,
    `${HASH_A}.mp3`,
    '',
  ])('rejects the audio file name %j without writing anything', async (name) => {
    const { dbPath, keyPath } = setupFiles();
    const envelope = envelopeOf(await exportBackup(dbPath, keyPath));
    envelope.audio = { [name]: Buffer.from('evil').toString('base64') };
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();

    expect(() => importBackup(regzip(envelope), restoredDb, restoredKey, restoredAudio)).toThrow(
      new InvalidBackupError('Backup archive has an invalid audio file name')
    );
    expect(existsSync(restoredDb)).toBe(false);
    expect(existsSync(restoredKey)).toBe(false);
    expect(existsSync(restoredAudio)).toBe(false);
  });

  it('rejects an audio map that is not an object of base64 strings', async () => {
    const { dbPath, keyPath } = setupFiles();
    const base = envelopeOf(await exportBackup(dbPath, keyPath));
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    for (const audio of [null, [], 'x', { [`${HASH_A}.ogg`]: 42 }, { [`${HASH_A}.ogg`]: 'not base64!' }]) {
      expect(() => importBackup(regzip({ ...base, audio }), restoredDb, restoredKey, restoredAudio)).toThrow(InvalidBackupError);
    }
    expect(existsSync(restoredDb)).toBe(false);
  });

  it('rejects an audio file over the size limit', async () => {
    const { dbPath, keyPath } = setupFiles();
    const envelope = envelopeOf(await exportBackup(dbPath, keyPath));
    envelope.audio = { [`${HASH_A}.ogg`]: Buffer.alloc(101).toString('base64') };
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();

    expect(() => importBackup(regzip(envelope), restoredDb, restoredKey, restoredAudio, { maxAudioBytes: 100 })).toThrow(
      new InvalidBackupError('Backup archive has an audio file that is too large')
    );
    expect(existsSync(restoredDb)).toBe(false);

    envelope.audio = { [`${HASH_A}.ogg`]: Buffer.alloc(100).toString('base64') };
    importBackup(regzip(envelope), restoredDb, restoredKey, restoredAudio, { maxAudioBytes: 100 });
    expect(readFileSync(join(restoredAudio, `${HASH_A}.ogg`))).toHaveLength(100);
  });

  it('rejects a corrupt archive', () => {
    expect(() => importBackup(Buffer.from('not a real backup'), '/tmp/x', '/tmp/y')).toThrow(InvalidBackupError);
  });

  it('rejects a checksum mismatch', async () => {
    const { dbPath, keyPath } = setupFiles();
    const envelope = envelopeOf(await exportBackup(dbPath, keyPath));
    // Flip a character in the middle of the base64 db string
    const dbArray = (envelope.db as string).split('');
    const midpoint = Math.floor(dbArray.length / 2);
    dbArray[midpoint] = dbArray[midpoint] === 'a' ? 'b' : 'a';
    envelope.db = dbArray.join('');

    const { restoredDb, restoredKey } = restoreTarget();
    expect(() => importBackup(regzip(envelope), restoredDb, restoredKey)).toThrow(InvalidBackupError);
  });

  it('rejects a malformed backup with missing fields', async () => {
    const { dbPath, keyPath } = setupFiles();
    const envelope = envelopeOf(await exportBackup(dbPath, keyPath));
    delete envelope.db;

    const { restoredDb, restoredKey } = restoreTarget();
    expect(() => importBackup(regzip(envelope), restoredDb, restoredKey)).toThrow(InvalidBackupError);
  });

  it('caps the decompressed size: a small gzip that inflates past the cap is refused (zip bomb)', () => {
    const bomb = gzipSync(Buffer.alloc(10 * 1024 * 1024)); // ~10 KB that inflates to 10 MB
    expect(bomb.length).toBeLessThan(64 * 1024);
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    expect(() => importBackup(bomb, restoredDb, restoredKey, restoredAudio, { maxJsonBytes: 1024 * 1024 })).toThrow(
      new BackupTooLargeError('Backup archive is too large')
    );
    expect(existsSync(restoredDb)).toBe(false);
    // A BackupTooLargeError is an InvalidBackupError, so older callers still treat it as a bad file.
    expect(() => importBackup(bomb, restoredDb, restoredKey, restoredAudio, { maxJsonBytes: 1024 * 1024 })).toThrow(InvalidBackupError);
  });

  it('uses a ceiling that fits a real backup and a JS string', () => {
    expect(MAX_BACKUP_JSON_BYTES).toBeGreaterThan(400 * 1024 * 1024);
    expect(MAX_BACKUP_JSON_BYTES).toBeLessThanOrEqual(1024 * 1024 * 1024);
  });

  it('keeps an export under the cap by skipping clips, so it always imports', async () => {
    const { dbPath, keyPath, audioDir } = setupFiles();
    mkdirSync(audioDir);
    writeFileSync(join(audioDir, `${HASH_A}.ogg`), randomBytes(3000));
    writeFileSync(join(audioDir, `${HASH_B}.ogg`), randomBytes(3000));
    const cap = 6000; // room for the head and one clip (4000 base64 chars), not two
    const archive = await exportBackup(dbPath, keyPath, audioDir, { maxJsonBytes: cap });
    expect(gunzipSync(archive).length).toBeLessThanOrEqual(cap);
    expect(Object.keys(envelopeOf(archive).audio as object)).toHaveLength(1);
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    importBackup(archive, restoredDb, restoredKey, restoredAudio, { maxJsonBytes: cap });
    expect(readdirSync(restoredAudio)).toHaveLength(1);
  });

  it('refuses to export a database that alone passes the cap', async () => {
    const { dbPath, keyPath } = setupFiles();
    await expect(exportBackup(dbPath, keyPath, undefined, { maxJsonBytes: 100 })).rejects.toThrow(BackupTooLargeError);
  });

  it('writes the audio before the database and key, so a failed audio write leaves them untouched', async () => {
    const { dbPath, keyPath, audioDir } = setupFiles();
    mkdirSync(audioDir);
    writeFileSync(join(audioDir, `${HASH_A}.ogg`), 'clip');
    const archive = await exportBackup(dbPath, keyPath, audioDir);
    const { restoredDb, restoredKey, restoredAudio } = restoreTarget();
    writeFileSync(restoredDb, 'old-db');
    writeFileSync(restoredKey, 'old-key');
    writeFileSync(restoredAudio, 'a file where the audio folder should be'); // mkdir fails
    expect(() => importBackup(archive, restoredDb, restoredKey, restoredAudio)).toThrow();
    expect(readFileSync(restoredDb, 'utf8')).toBe('old-db');
    expect(readFileSync(restoredKey, 'utf8')).toBe('old-key');
  });
});
