import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { milestoneId, title, description } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    const section = service.createSection(milestoneId, title, description);
    return NextResponse.json(section, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
