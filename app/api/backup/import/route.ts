import { NextResponse } from 'next/server';
import { importBackup, InvalidBackupError } from '@/lib/services/backupService';
import { getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export async function POST(request: Request) {
  const arrayBuffer = await request.arrayBuffer();
  try {
    importBackup(Buffer.from(arrayBuffer), getDbPath(), defaultKeyFilePath());
    closeDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
