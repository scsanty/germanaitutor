import { describe, it, expect } from 'vitest';
import { randomBytes, createHmac } from 'node:crypto';
import { createDbClient } from '../db/client';
import { createAdminAuthService } from './adminAuthService';

describe('adminAuthService', () => {
  it('reports no password set, then set, after setPassword', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    expect(service.isPasswordSet()).toBe(false);
    service.setPassword('correct-horse-battery-staple');
    expect(service.isPasswordSet()).toBe(true);
  });

  it('verifies the correct password and rejects a wrong one', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    service.setPassword('correct-horse-battery-staple');
    expect(service.verifyPassword('correct-horse-battery-staple')).toBe(true);
    expect(service.verifyPassword('wrong-password')).toBe(false);
  });

  it('round-trips a valid session token', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    const secret = randomBytes(32);
    const token = service.createSessionToken(secret);
    expect(service.verifySessionToken(token, secret)).toBe(true);
  });

  it('rejects a token signed with a different secret', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    const token = service.createSessionToken(randomBytes(32));
    expect(service.verifySessionToken(token, randomBytes(32))).toBe(false);
  });

  it('rejects an expired token', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    const secret = randomBytes(32);
    const staleIssuedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ issuedAt: staleIssuedAt })).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const staleToken = `${payload}.${signature}`;
    expect(service.verifySessionToken(staleToken, secret)).toBe(false);
  });
});
