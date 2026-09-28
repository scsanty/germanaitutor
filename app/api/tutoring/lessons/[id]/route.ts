import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const view = createProgressService(getDb()).getLessonView(params.id);
  if (!view) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  return NextResponse.json(view);
}
