import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const view = createProgressService(getDb()).getLessonView(params.id);
  if (!view) return NextResponse.json(errorBody('Lesson not found', 'not_found'), { status: 404 });
  return NextResponse.json(view);
}
