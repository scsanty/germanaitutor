import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumAuditService } from '@/lib/services/curriculumAuditService';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(createCurriculumAuditService(getDb()).listFlashcardViolations());
}
