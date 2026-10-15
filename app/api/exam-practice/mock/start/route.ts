import { getDb } from '@/lib/db/client';
import { createExamPracticeService } from '@/lib/services/examPracticeService';
import { badRequest, readBody, respond } from '../../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody(request);
  if (typeof body?.formatId !== 'string') return badRequest('formatId is required');
  const { formatId } = body;
  return respond(() => createExamPracticeService(getDb()).startMock(formatId));
}
