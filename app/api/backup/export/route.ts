import { NextResponse } from 'next/server';
import { exportBackup } from '@/lib/services/backupService';
import { getDb, getDbPath } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export const dynamic = 'force-dynamic';

export async function GET() {
  // The DB runs in WAL mode, so committed writes may still live only in the
  // `-wal` sidecar file. Fold them into `app.db` before snapshotting the file,
  // otherwise the archive can be stale (or empty).
  getDb().pragma('wal_checkpoint(TRUNCATE)');
  const archive = exportBackup(getDbPath(), defaultKeyFilePath());
  return new NextResponse(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="germanaitutor-backup.gaitbackup"',
    },
  });
}
