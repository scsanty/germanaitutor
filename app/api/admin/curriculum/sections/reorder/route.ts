import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { milestoneId, orderedIds } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    service.reorderSections(milestoneId, orderedIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
