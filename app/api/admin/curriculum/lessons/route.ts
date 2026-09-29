import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createLessonAdminService } from '@/lib/services/lessonAdminService';
import { createLessonDeleteService } from '@/lib/services/lessonDeleteService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = await request.json();
  const service = createLessonAdminService(getDb());
  try {
    const lesson = service.createLesson(input);
    return NextResponse.json(lesson, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonIds } = await request.json();
  const service = createLessonDeleteService(getDb());
  try {
    service.batchDelete(lessonIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
