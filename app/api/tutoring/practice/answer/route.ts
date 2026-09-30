import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPracticeService, toPracticeErrorResponse } from '@/lib/services/practiceService';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { parseLessonAnswer } from '@/lib/tutoring/lessonAnswers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const practiceExerciseId = body?.practiceExerciseId;
  const answer = parseLessonAnswer(body?.answer);
  if (typeof practiceExerciseId !== 'string' || !answer) {
    return NextResponse.json(errorBody('practiceExerciseId and a valid answer are required', 'bad_request'), { status: 400 });
  }
  try {
    return NextResponse.json(await createPracticeService(getDb()).gradeAnswer(practiceExerciseId, answer));
  } catch (err) {
    const mapped = toPracticeErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
