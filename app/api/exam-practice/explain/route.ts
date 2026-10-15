import { getDb } from '@/lib/db/client';
import { createExamPracticeService } from '@/lib/services/examPracticeService';
import { badRequest, isId, readBody, respond } from '../respond';

export const dynamic = 'force-dynamic';

const QUESTION_LIMIT = 500;

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body || !isId(body.attemptId)) return badRequest('attemptId is required');
  const { attemptId, itemIndex, question } = body;
  if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex) || itemIndex < 0) return badRequest('itemIndex must be a whole number');
  if (typeof question !== 'string' || !question.trim() || question.length > QUESTION_LIMIT) {
    return badRequest(`question must be 1–${QUESTION_LIMIT} characters`);
  }
  return respond(() => createExamPracticeService(getDb()).explain(attemptId, itemIndex, question));
}
