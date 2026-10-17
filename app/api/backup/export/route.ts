import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { createBackupStream } from '@/lib/services/backupService';
import { getDb, getDbPath } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { audioDir } from '@/lib/audio/audioStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  // The DB runs in WAL mode, so committed writes may still live only in the
  // `-wal` sidecar file. Fold them into `app.db` before snapshotting the file,
  // otherwise the archive can be stale (or empty).
  getDb().pragma('wal_checkpoint(TRUNCATE)');
  // Review Focus 5: the gzip stream goes straight to the response, so the archive (with every
  // audio file) is never held whole in memory.
  const archive = createBackupStream(getDbPath(), defaultKeyFilePath(), audioDir());
  return new NextResponse(Readable.toWeb(archive) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="germanaitutor-backup.gaitbackup"',
    },
  });
}
