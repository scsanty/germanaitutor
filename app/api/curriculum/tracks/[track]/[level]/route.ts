import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track, CefrLevel } from '@/lib/types';

export async function GET(_request: Request, { params }: { params: { track: string; level: string } }) {
  const service = createCurriculumService(getDb());
  const structure = service.getTrackStructure(params.track as Track, params.level as CefrLevel);
  return NextResponse.json(structure);
}
