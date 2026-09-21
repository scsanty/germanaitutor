import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export async function GET() {
  const service = createCurriculumService(getDb());
  return NextResponse.json(service.listTracks());
}
