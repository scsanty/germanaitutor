import { NextResponse } from 'next/server';
import { exportBackup } from '@/lib/services/backupService';
import { getDbPath } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export async function GET() {
  const archive = exportBackup(getDbPath(), defaultKeyFilePath());
  return new NextResponse(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="germanaitutor-backup.gaitbackup"',
    },
  });
}
