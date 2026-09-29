import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import { isCefrLevel, isTrack } from '@/lib/tutoring/levels';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { track: string; level: string } }) {
  // This is a public, unauthenticated GET route whose read path (getTrackStructure ->
  // ensureUnsortedExists) has a side-effecting INSERT on every call. Validating track/level
  // here, before that's reached, keeps a bad value from throwing inside the handler (a 500)
  // for what should just be "not found" input — see the finding this addresses for why the
  // side effect itself is out of scope for this fix.
  if (!isTrack(params.track) || !isCefrLevel(params.level)) {
    return NextResponse.json({ error: `Invalid track or level: ${params.track}/${params.level}` }, { status: 400 });
  }
  const service = createCurriculumService(getDb());
  return NextResponse.json(service.getTrackStructure(params.track, params.level));
}
