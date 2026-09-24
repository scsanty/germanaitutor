import { NextResponse } from 'next/server';
import { unlinkSync, existsSync } from 'node:fs';
import { getDb, getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { loadBundledSeeds } from '@/lib/services/bundledSeeds';

export async function POST() {
  closeDb();
  const dbPath = getDbPath();
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, defaultKeyFilePath()]) {
    if (existsSync(path)) unlinkSync(path);
  }
  // The fresh DB has empty curriculum and placement tables; reload the bundled
  // seeds now instead of leaving that to the next server restart (I-1).
  loadBundledSeeds(getDb());
  return NextResponse.json({ ok: true });
}
