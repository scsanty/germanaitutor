import { NextResponse } from 'next/server';
import { isAdminSessionValid } from '@/lib/auth/adminSession';

// Shared by the admin settings, notifications and audio routes. Admin errors are English text.
export async function notAdmin(): Promise<boolean> {
  return !(await isAdminSessionValid());
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function adminError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
