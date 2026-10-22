import { getDb } from '@/lib/db/client';
import { createExamPracticeService } from '@/lib/services/examPracticeService';
import { badRequest, readBody, respond } from '../../respond';

export const dynamic = 'force-dynamic';

// POST { mockId } → { mockId, runs }: the mock's oral block, started now with its own clock (B4).
export async function POST(request: Request) {
  const body = await readBody(request);
  if (typeof body?.mockId !== 'string' || !body.mockId) return badRequest('mockId is required');
  const { mockId } = body;
  return respond(() => createExamPracticeService(getDb()).startMockOral(mockId));
}
