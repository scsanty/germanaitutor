import { getDb } from '@/lib/db/client';
import { createExamPracticeService } from '@/lib/services/examPracticeService';
import { badRequest, readBody, respond } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody(request);
  if (typeof body?.formatId !== 'string' || typeof body.partId !== 'string') return badRequest('formatId and partId are required');
  const { formatId, partId } = body;
  return respond(() => createExamPracticeService(getDb()).start(formatId, partId));
}
