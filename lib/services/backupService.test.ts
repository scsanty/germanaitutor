// lib/services/backupService.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => importBackup(tampered, '/tmp/x', '/tmp/y')).toThrow();
  });
});
