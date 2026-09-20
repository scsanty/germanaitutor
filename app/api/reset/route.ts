import { NextResponse } from 'next/server';
import { unlinkSync, existsSync } from 'node:fs';
import { getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export async function POST() {
  closeDb();
  const dbPath = getDbPath();
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, defaultKeyFilePath()]) {
    if (existsSync(path)) unlinkSync(path);
  }
  return NextResponse.json({ ok: true });
}
