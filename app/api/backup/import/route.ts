import { NextResponse } from 'next/server';
import { BackupTooLargeError, importBackup, InvalidBackupError, MAX_BACKUP_ARCHIVE_BYTES } from '@/lib/services/backupService';
import { declaresMoreThan, readCappedBody } from '@/lib/http/readCappedBody';
import { getDb, getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { loadBundledSeeds } from '@/lib/services/bundledSeeds';
import { audioDir } from '@/lib/audio/audioStore';
import { createAudioService } from '@/lib/services/audioService';
import { createNotificationService } from '@/lib/services/notificationService';

const TOO_LARGE = 'The backup file is too large';

// No auth yet: Accounts adds it. The size caps keep an anonymous upload from exhausting memory.
export async function POST(request: Request) {
  if (declaresMoreThan(request, MAX_BACKUP_ARCHIVE_BYTES)) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  const archive = await readCappedBody(request, MAX_BACKUP_ARCHIVE_BYTES);
  if (archive === null) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  // Close the DB *before* overwriting the file: an open WAL-mode connection
  // would otherwise replay its stale `-wal` frames over the restored database.
  // S2: the background worker resolves getDb() on every tick, so it picks up the reopened handle.
  closeDb();
  try {
    importBackup(archive, getDbPath(), defaultKeyFilePath(), audioDir());
    // A backup from before the bundled seeds existed (or one taken right after
    // a reset) can restore an empty curriculum/placement table; reload the
    // bundled seeds now instead of leaving that to the next server restart (I-1).
    const db = getDb();
    loadBundledSeeds(db);
    // S19: queue audio the restored content needs, and re-queue jobs whose file is missing (a version-1
    // archive has no audio). Restored files are already in place, so their jobs keep their status.
    createAudioService(db, { notify: createNotificationService(db) }).sweep();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BackupTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof InvalidBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
