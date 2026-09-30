import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPracticeAdminService, PracticeAdminError } from '@/lib/services/practiceAdminService';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await props.params;
  try {
    return NextResponse.json(createPracticeAdminService(getDb()).promote(id));
  } catch (err) {
    if (err instanceof PracticeAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.kind === 'not_found' ? 404 : 400 });
    }
    throw err;
  }
}
