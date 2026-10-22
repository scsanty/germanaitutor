import { getDb } from '@/lib/db/client';
import { createSpokenPartService } from '@/lib/services/spokenPartService';
import { badRequest, isId, readBody, respond } from '../../respond';

export const dynamic = 'force-dynamic';

// POST { attemptId } → the graded result, with the conversation (only in this response).
export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body || !isId(body.attemptId)) return badRequest('attemptId is required');
  const { attemptId } = body;
  return respond(() => createSpokenPartService(getDb()).finish(attemptId));
}
