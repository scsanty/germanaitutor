import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumExportService, seedFileName } from '@/lib/services/curriculumExportService';
import { isCefrLevel, TRACKS } from '@/lib/tutoring/levels';
import type { Track } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ track: string; level: string }> }) {
  const params = await props.params;
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const track = params.track as Track;
  if (!TRACKS.includes(track) || !isCefrLevel(params.level)) {
    return NextResponse.json({ error: 'Unknown track or level' }, { status: 400 });
  }
  const seed = createCurriculumExportService(getDb()).exportTrackLevel(track, params.level);
  return new Response(`${JSON.stringify(seed, null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${seedFileName(track, params.level)}"`,
    },
  });
}
