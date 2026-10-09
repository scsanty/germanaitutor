import { getDb } from '@/lib/db/client';
import { createExamPracticeService } from '@/lib/services/examPracticeService';
import { badRequest, isId, readBody, respond } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body || !isId(body.attemptId) || !('answers' in body)) return badRequest('attemptId and answers are required');
  const { attemptId, answers } = body;
  return respond(() => createExamPracticeService(getDb()).submit(attemptId, answers));
}
