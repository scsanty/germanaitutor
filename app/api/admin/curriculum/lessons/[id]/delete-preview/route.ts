import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createLessonDeleteService } from '@/lib/services/lessonDeleteService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createLessonDeleteService(getDb());
  try {
    const preview = service.getDeletePreview(params.id);
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
