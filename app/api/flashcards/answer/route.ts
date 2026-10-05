import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createDeckService, toDeckErrorResponse } from '@/lib/services/deckService';
import { errorBody } from '@/lib/tutoring/errorCodes';
import type { FlashcardRating } from '@/lib/tutoring/lessonAnswers';

export const dynamic = 'force-dynamic';

const RATINGS: readonly string[] = ['knew', 'sort_of', 'didnt_know'];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const itemId = body?.itemId;
  const rating = body?.rating;
  if (!Number.isInteger(itemId) || typeof rating !== 'string' || !RATINGS.includes(rating)) {
    return NextResponse.json(errorBody('itemId and a valid rating are required', 'bad_request'), { status: 400 });
  }
  try {
    return NextResponse.json(createDeckService(getDb()).answer(itemId, rating as FlashcardRating));
  } catch (err) {
    const mapped = toDeckErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
