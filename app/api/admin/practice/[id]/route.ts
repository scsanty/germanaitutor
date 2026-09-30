import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPracticeAdminService, PracticeAdminError } from '@/lib/services/practiceAdminService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const service = createPracticeAdminService(getDb());
  try {
    if (body?.action === 'approve') return NextResponse.json(service.setStatus(id, 'approved'));
    if (body?.action === 'reject') return NextResponse.json(service.setStatus(id, 'rejected'));
    if (body && 'content' in body) return NextResponse.json(service.editContent(id, body.content));
    return NextResponse.json({ error: 'Send { action: "approve" | "reject" } or { content }' }, { status: 400 });
  } catch (err) {
    if (err instanceof PracticeAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.kind === 'not_found' ? 404 : 400 });
    }
    throw err;
  }
}
