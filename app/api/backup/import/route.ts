import { NextResponse } from 'next/server';
import { importBackup, InvalidBackupError } from '@/lib/services/backupService';
import { getDb, getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { loadBundledSeeds } from '@/lib/services/bundledSeeds';

export async function POST(request: Request) {
  const arrayBuffer = await request.arrayBuffer();
  // Close the DB *before* overwriting the file: an open WAL-mode connection
  // would otherwise replay its stale `-wal` frames over the restored database.
  closeDb();
  try {
    importBackup(Buffer.from(arrayBuffer), getDbPath(), defaultKeyFilePath());
    // A backup from before the bundled seeds existed (or one taken right after
    // a reset) can restore an empty curriculum/placement table; reload the
    // bundled seeds now instead of leaving that to the next server restart (I-1).
    loadBundledSeeds(getDb());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
