import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { parsePlacementAnswer } from '@/lib/tutoring/placementTypes';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { respondWithPlacementErrors } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const questionId = body?.questionId;
  const answer = parsePlacementAnswer(body?.answer);
  if (typeof questionId !== 'string' || !answer) {
    return NextResponse.json(errorBody('questionId and a valid answer are required', 'bad_request'), { status: 400 });
  }
  return respondWithPlacementErrors(() => createPlacementService(getDb()).answer(questionId, answer));
}
