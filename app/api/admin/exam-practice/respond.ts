import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { toTeilSetErrorResponse } from '@/lib/services/teilSetService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function notAdmin(): Promise<boolean> {
  return !(await isAdminSessionValid());
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json(errorBody(message, 'bad_request'), { status: 400 });
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

// Runs a service call; a TeilSetError becomes its status (400/404/409) and error body, anything else is a 500.
export async function respond(run: () => unknown, status = 200): Promise<NextResponse> {
  try {
    return NextResponse.json(await run(), { status });
  } catch (err) {
    const mapped = toTeilSetErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
