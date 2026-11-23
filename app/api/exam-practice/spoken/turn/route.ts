import { getDb } from '@/lib/db/client';
import { createSpokenPartService } from '@/lib/services/spokenPartService';
import { badRequest, isId, readBody, respond } from '../../respond';

export const dynamic = 'force-dynamic';

// POST { attemptId, clipId } → { turns, state }: the student's recorded turn and the partner's (or examiner's) reply.
export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body || !isId(body.attemptId) || typeof body.clipId !== 'string' || !body.clipId) return badRequest('attemptId and clipId are required');
  const { attemptId, clipId } = body;
  return respond(() => createSpokenPartService(getDb()).turn(attemptId, clipId));
}
