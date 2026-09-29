import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createLessonAdminService } from '@/lib/services/lessonAdminService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = await request.json();
  const service = createLessonAdminService(getDb());
  try {
    const lesson = service.updateLesson(params.id, input);
    return NextResponse.json(lesson);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
