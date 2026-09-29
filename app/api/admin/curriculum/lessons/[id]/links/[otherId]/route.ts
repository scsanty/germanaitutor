import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createConceptLinkService } from '@/lib/services/conceptLinkService';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, props: { params: Promise<{ id: string; otherId: string }> }) {
  const params = await props.params;
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createConceptLinkService(getDb());
  service.removeLink(params.id, params.otherId);
  return NextResponse.json({ ok: true });
}
