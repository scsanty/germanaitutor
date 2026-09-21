import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const track = (url.searchParams.get('track') ?? 'generic') as Track;
  const service = createCurriculumService(getDb());
  const lesson = service.getLesson(params.id, track);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    lesson,
    exercises: service.getExercises(params.id, track),
    prerequisites: service.getPrerequisites(params.id),
  });
}
