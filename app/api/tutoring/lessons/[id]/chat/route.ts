import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createLessonChatService, toChatErrorResponse } from '@/lib/services/lessonChatService';

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
  if (typeof message !== 'string' || (exerciseId !== null && typeof exerciseId !== 'string')) {
    return NextResponse.json({ error: 'message (text) and an optional exerciseId are required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createLessonChatService(getDb()).send(params.id, message, exerciseId));
  } catch (err) {
    return mapError(err);
  }
}
