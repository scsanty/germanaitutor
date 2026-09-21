import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createCurriculumService(getDb());
  return NextResponse.json(service.listTracks());
}
