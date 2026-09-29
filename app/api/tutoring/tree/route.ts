import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { createProgressService } from '@/lib/services/progressService';
import { createUnlockService } from '@/lib/services/unlockService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  // M-3: an admin edit (delete, move to Unsorted, a new concept link) can finish the active
  // level without any new completion being recorded, since the level-finished check normally
  // only runs from `recordAttempt`. Run it here too — idempotent, and cheap enough for a GET.
  // progressService can't call unlockService itself: unlockService already imports
  // progressService, and a call back the other way would be a cycle.
  createUnlockService(db).checkLevelFinishedAfterCompletion(createProfileService(db).getProfile().activeLevel);
  return NextResponse.json(createProgressService(db).getTree());
}
