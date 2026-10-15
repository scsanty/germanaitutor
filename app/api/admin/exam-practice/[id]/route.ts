import { getDb } from '@/lib/db/client';
import { createTeilSetService } from '@/lib/services/teilSetService';
import type { TeilSetContent } from '@/lib/exam/teilSets';
import { badRequest, notAdmin, readBody, respond, unauthorized } from '../respond';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// PATCH { status: 'approved' | 'rejected' } or { set }. Reserved sets are refused by the service.
export async function PATCH(request: Request, props: Ctx) {
  if (await notAdmin()) return unauthorized();
  const { id } = await props.params;
  const body = await readBody(request);
  const service = createTeilSetService(getDb());
  if (typeof body?.status === 'string') {
    const status = body.status;
    return respond(() => {
      service.setStatus(id, status);
      return { ok: true };
    });
  }
  if (body && typeof body.set === 'object' && body.set !== null) {
    const set = body.set as TeilSetContent;
    return respond(() => {
      service.update(id, set);
      return { ok: true };
    });
  }
  return badRequest('Send { status } or { set }');
}

// S18: Duplicate copies the set under a new pool id, unreviewed, and returns the new row.
export async function POST(_request: Request, props: Ctx) {
  if (await notAdmin()) return unauthorized();
  const { id } = await props.params;
  return respond(() => createTeilSetService(getDb()).duplicate(id), 201);
}

// Starter and pool sets only; a reserved set is a 400.
export async function DELETE(_request: Request, props: Ctx) {
  if (await notAdmin()) return unauthorized();
  const { id } = await props.params;
  return respond(() => {
    createTeilSetService(getDb()).remove(id);
    return { ok: true };
  });
}
