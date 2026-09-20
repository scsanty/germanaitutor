// lib/services/backupService.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { exportBackup, importBackup, InvalidBackupError } from './backupService';

function setupFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'gait-backup-'));
  const dbPath = join(dir, 'app.db');
  const keyPath = join(dir, 'master.key');
  writeFileSync(dbPath, 'fake-db-contents');
  writeFileSync(keyPath, 'fake-key-contents');
  return { dbPath, keyPath };
}

describe('backupService', () => {
  it('round-trips db and key contents through export/import', () => {
    const { dbPath, keyPath } = setupFiles();
    const archive = exportBackup(dbPath, keyPath);

    const restoreDir = mkdtempSync(join(tmpdir(), 'gait-restore-'));
    const restoredDb = join(restoreDir, 'app.db');
    const restoredKey = join(restoreDir, 'master.key');
    importBackup(archive, restoredDb, restoredKey);

    expect(readFileSync(restoredDb, 'utf8')).toBe('fake-db-contents');
    expect(readFileSync(restoredKey, 'utf8')).toBe('fake-key-contents');
  });

  it('rejects a corrupt archive', () => {
    expect(() => importBackup(Buffer.from('not a real backup'), '/tmp/x', '/tmp/y')).toThrow(
      InvalidBackupError
    );
  });

  it('rejects a checksum mismatch', () => {
    const { dbPath, keyPath } = setupFiles();
    const archive = exportBackup(dbPath, keyPath);

    // Gunzip, parse, mutate a character in the base64 db field, re-gzip
    const decompressed = gunzipSync(archive).toString('utf8');
    const envelope = JSON.parse(decompressed);
    // Flip a character in the middle of the base64 db string
    const dbArray = envelope.db.split('');
    const midpoint = Math.floor(dbArray.length / 2);
    dbArray[midpoint] = dbArray[midpoint] === 'a' ? 'b' : 'a';
    envelope.db = dbArray.join('');
    const tampered = gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));

    const restoreDir = mkdtempSync(join(tmpdir(), 'gait-restore-'));
    const restoredDb = join(restoreDir, 'app.db');
    const restoredKey = join(restoreDir, 'master.key');

    expect(() => importBackup(tampered, restoredDb, restoredKey)).toThrow(InvalidBackupError);
  });

  it('rejects a malformed backup with missing fields', () => {
    // Create a valid backup, then remove the db field
    const { dbPath, keyPath } = setupFiles();
    const archive = exportBackup(dbPath, keyPath);

    // Gunzip, parse, delete required field, re-gzip
    const decompressed = gunzipSync(archive).toString('utf8');
    const envelope = JSON.parse(decompressed);
    delete envelope.db;
    const malformed = gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));

    const restoreDir = mkdtempSync(join(tmpdir(), 'gait-restore-'));
    const restoredDb = join(restoreDir, 'app.db');
    const restoredKey = join(restoreDir, 'master.key');

    expect(() => importBackup(malformed, restoredDb, restoredKey)).toThrow(InvalidBackupError);
  });
});
