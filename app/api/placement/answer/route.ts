import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService, toPlacementErrorResponse } from '@/lib/services/placementService';
import { parsePlacementAnswer } from '@/lib/tutoring/placementTypes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const questionId = body?.questionId;
  const answer = parsePlacementAnswer(body?.answer);
  if (typeof questionId !== 'string' || !answer) {
    return NextResponse.json({ error: 'questionId and a valid answer are required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createPlacementService(getDb()).answer(questionId, answer));
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
