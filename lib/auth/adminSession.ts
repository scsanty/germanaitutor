import { cookies } from 'next/headers';
import { getDb } from '../db/client';
import { createAdminAuthService } from '../services/adminAuthService';
import { loadOrCreateSessionSecret } from '../crypto/sessionSecret';

export const ADMIN_SESSION_COOKIE = 'admin_session';

export function isAdminSessionValid(): boolean {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = loadOrCreateSessionSecret();
  const service = createAdminAuthService(getDb());
  return service.verifySessionToken(token, secret);
}
