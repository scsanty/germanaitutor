import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { parseLessonAnswer } from '@/lib/tutoring/lessonAnswers';
import { createTestOutService, toTestOutErrorResponse } from '@/lib/services/testOutService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json().catch(() => null);
  const answer = parseLessonAnswer(body?.answer);
  if (typeof body?.exerciseId !== 'string' || !answer) {
    return NextResponse.json(errorBody('exerciseId and a valid answer are required', 'bad_request'), { status: 400 });
  }
  try {
    return NextResponse.json(await createTestOutService(getDb()).answer(params.id, body.exerciseId, answer));
  } catch (err) {
    const mapped = toTestOutErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
