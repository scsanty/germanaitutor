import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createAttemptService, toAttemptErrorResponse } from '@/lib/services/attemptService';
import { isAttemptSource, parseLessonAnswer } from '@/lib/tutoring/lessonAnswers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const exerciseId = body?.exerciseId;
  const answer = parseLessonAnswer(body?.answer);
  const source = body?.source;
  if (typeof exerciseId !== 'string' || !answer || !isAttemptSource(source)) {
    return NextResponse.json(
      { error: 'exerciseId, a valid answer, and source ("lesson" or "queue") are required' },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await createAttemptService(getDb()).recordAttempt(exerciseId, answer, source));
  } catch (err) {
    const mapped = toAttemptErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
