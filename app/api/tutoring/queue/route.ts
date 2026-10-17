import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';
import { localDate } from '@/lib/tutoring/dates';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await createProgressService(getDb()).getDailyQueue(localDate()));
}
