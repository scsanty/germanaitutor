import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import { createConceptLinkService } from '@/lib/services/conceptLinkService';
import type { Track } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const track = (url.searchParams.get('track') ?? 'generic') as Track;
  const db = getDb();
  const service = createCurriculumService(db);
  const lesson = service.getLesson(params.id, track);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const conceptLinkService = createConceptLinkService(db);
  const conceptLinks = conceptLinkService.getLinksForLesson(params.id).map((link) => {
    const otherId = link.lessonAId === params.id ? link.lessonBId : link.lessonAId;
    const other = service.getLesson(otherId, track);
    return { id: otherId, title: other?.title ?? otherId, track: other?.track ?? track };
  });

  return NextResponse.json({
    lesson,
    exercises: service.getExercises(params.id, track),
    prerequisites: service.getPrerequisites(params.id),
    conceptLinks,
  });
}
