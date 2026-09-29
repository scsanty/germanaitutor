import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db/client';
import { createAdminAuthService } from '@/lib/services/adminAuthService';
import { loadOrCreateSessionSecret } from '@/lib/crypto/sessionSecret';
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/auth/adminSession';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createAdminAuthService(getDb());
  return NextResponse.json({
    passwordSet: service.isPasswordSet(),
    authenticated: await isAdminSessionValid(),
  });
}

export async function POST(request: Request) {
  const { password } = await request.json();
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }
  const service = createAdminAuthService(getDb());
  if (!service.isPasswordSet()) {
    service.setPassword(password);
  } else if (!service.verifyPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }
  const secret = loadOrCreateSessionSecret();
  const token = service.createSessionToken(secret);
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(ADMIN_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
