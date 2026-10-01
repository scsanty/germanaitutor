import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';
import { localDate } from '@/lib/tutoring/dates';

export const dynamic = 'force-dynamic';

// The review badge: reviews still to do today (already capped by the daily limit).
export async function GET() {
  return NextResponse.json({ due: createProgressService(getDb()).getDailyQueue(localDate()).items.length });
}
