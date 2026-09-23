import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track, CefrLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const VALID_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export async function GET(_request: Request, { params }: { params: { track: string; level: string } }) {
  // This is a public, unauthenticated GET route whose read path (getTrackStructure ->
  // ensureUnsortedExists) has a side-effecting INSERT on every call. Validating track/level
  // here, before that's reached, keeps a bad value from throwing inside the handler (a 500)
  // for what should just be "not found" input — see the finding this addresses for why the
  // side effect itself is out of scope for this fix.
  if (!VALID_TRACKS.includes(params.track as Track) || !VALID_LEVELS.includes(params.level as CefrLevel)) {
    return NextResponse.json({ error: `Invalid track or level: ${params.track}/${params.level}` }, { status: 400 });
  }
  const service = createCurriculumService(getDb());
  const structure = service.getTrackStructure(params.track as Track, params.level as CefrLevel);
  return NextResponse.json(structure);
}
