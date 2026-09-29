import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createAttemptService, toAttemptErrorResponse } from '@/lib/services/attemptService';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(createAttemptService(getDb()).markLessonDone(params.id));
  } catch (err) {
    const mapped = toAttemptErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
