import { NextResponse } from 'next/server';
import { toPracticeErrorResponse } from '@/lib/services/examPracticeService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export function badRequest(message: string): NextResponse {
  return NextResponse.json(errorBody(message, 'bad_request'), { status: 400 });
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

// Runs a service call and maps PracticeError to its status and error body.
export async function respond(run: () => unknown | Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const mapped = toPracticeErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
