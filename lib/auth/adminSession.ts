import { cookies } from 'next/headers';
import { getDb } from '../db/client';
import { createAdminAuthService } from '../services/adminAuthService';
import { loadOrCreateSessionSecret } from '../crypto/sessionSecret';

export const ADMIN_SESSION_COOKIE = 'admin_session';

export async function isAdminSessionValid(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = loadOrCreateSessionSecret();
  const service = createAdminAuthService(getDb());
  return service.verifySessionToken(token, secret);
}
