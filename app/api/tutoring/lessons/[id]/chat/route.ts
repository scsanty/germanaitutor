import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createLessonChatService, toChatErrorResponse } from '@/lib/services/lessonChatService';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { CHAT_MESSAGE_MAX_LENGTH } from '@/lib/tutoring/lessonChat';

export const dynamic = 'force-dynamic';

function mapError(err: unknown) {
  const mapped = toChatErrorResponse(err);
  if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
  throw err;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(createLessonChatService(getDb()).getThread(params.id));
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json().catch(() => null);
  const message = body?.message;
  const exerciseId = body?.exerciseId ?? null;
  const practiceExerciseId = body?.practiceExerciseId ?? null;
  const practiceAnswer = body?.practiceAnswer;
  const validResult = (value: unknown) => value === 'correct' || value === 'almost' || value === 'wrong';
  const practiceOk =
    practiceExerciseId === null ||
    (typeof practiceExerciseId === 'string' &&
      typeof practiceAnswer?.answerText === 'string' &&
      practiceAnswer.answerText.length <= CHAT_MESSAGE_MAX_LENGTH &&
      validResult(practiceAnswer?.result));
  if (typeof message !== 'string' || (exerciseId !== null && typeof exerciseId !== 'string') || !practiceOk) {
    return NextResponse.json(
      errorBody('message (text), an optional exerciseId, or a practiceExerciseId with its practiceAnswer are required', 'bad_request'),
      { status: 400 }
    );
  }
  const practice =
    practiceExerciseId === null
      ? null
      : { practiceExerciseId, answerText: practiceAnswer.answerText as string, result: practiceAnswer.result };
  try {
    return NextResponse.json(await createLessonChatService(getDb()).send(params.id, message, exerciseId, practice));
  } catch (err) {
    return mapError(err);
  }
}
