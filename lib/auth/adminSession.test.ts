import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '../db/client';
import { createAdminAuthService } from '../services/adminAuthService';
import { loadOrCreateSessionSecret } from '../crypto/sessionSecret';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

import { isAdminSessionValid } from './adminSession';

describe('isAdminSessionValid', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-session-'));
    cookieStore.clear();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns false when no cookie is present', () => {
    expect(isAdminSessionValid()).toBe(false);
  });

  it('returns true for a valid session token', () => {
    const service = createAdminAuthService(getDb());
    const secret = loadOrCreateSessionSecret();
    cookieStore.set('admin_session', service.createSessionToken(secret));
    expect(isAdminSessionValid()).toBe(true);
  });

  it('returns false for a tampered token', () => {
    const service = createAdminAuthService(getDb());
    const secret = loadOrCreateSessionSecret();
    const token = service.createSessionToken(secret);
    const [payload, signature] = token.split('.');
    // Flip the first hex digit so the signature decodes to a different value of the same byte length
    // (appending non-hex text after a valid signature doesn't work: Node's hex decoder silently stops
    // at the first invalid character, so the original valid bytes would parse through unchanged).
    const flippedDigit = signature[0] === '0' ? '1' : '0';
    const tamperedSignature = flippedDigit + signature.slice(1);
    cookieStore.set('admin_session', `${payload}.${tamperedSignature}`);
    expect(isAdminSessionValid()).toBe(false);
  });
});
