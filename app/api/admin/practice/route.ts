import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPracticeAdminService, type PracticeReviewStatus } from '@/lib/services/practiceAdminService';
import { isCefrLevel, isTrack } from '@/lib/tutoring/levels';

export const dynamic = 'force-dynamic';

const STATUSES: readonly string[] = ['unreviewed', 'approved', 'rejected'];

export async function GET(request: Request) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const status = query.get('status');
  const track = query.get('track');
  const level = query.get('level');
  const lessonId = query.get('lessonId');
  return NextResponse.json(
    createPracticeAdminService(getDb()).list({
      status: status && STATUSES.includes(status) ? (status as PracticeReviewStatus) : undefined,
      track: isTrack(track) ? track : undefined,
      level: isCefrLevel(level) ? level : undefined,
      lessonId: lessonId ?? undefined,
    })
  );
}
