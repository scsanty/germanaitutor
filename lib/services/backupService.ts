import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const BACKUP_VERSION = 1;

interface BackupEnvelope {
  version: number;
  exportedAt: string;
  db: string;
  dbHash: string;
  key: string;
  keyHash: string;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function exportBackup(dbPath: string, keyFilePath: string): Buffer {
  const dbBuf = readFileSync(dbPath);
  const keyBuf = readFileSync(keyFilePath);
  const envelope: BackupEnvelope = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    db: dbBuf.toString('base64'),
    dbHash: sha256(dbBuf),
    key: keyBuf.toString('base64'),
    keyHash: sha256(keyBuf),
  };
  return gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));
}

export class InvalidBackupError extends Error {}

export function importBackup(archive: Buffer, dbPath: string, keyFilePath: string): void {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(gunzipSync(archive).toString('utf8'));
  } catch {
    throw new InvalidBackupError('Archive is not a valid backup file');
  }
  if (envelope.version !== BACKUP_VERSION) {
    throw new InvalidBackupError(`Unsupported backup version ${envelope.version}`);
  }
  const dbBuf = Buffer.from(envelope.db, 'base64');
  const keyBuf = Buffer.from(envelope.key, 'base64');
  if (sha256(dbBuf) !== envelope.dbHash || sha256(keyBuf) !== envelope.keyHash) {
    throw new InvalidBackupError('Backup archive is corrupt (checksum mismatch)');
  }
  writeFileSync(dbPath, dbBuf);
  writeFileSync(keyFilePath, keyBuf, { mode: 0o600 });
}
