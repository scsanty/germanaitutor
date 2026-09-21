import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import type Database from 'better-sqlite3';

const SCRYPT_KEYLEN = 64;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createAdminAuthService(db: Database.Database) {
  function isPasswordSet(): boolean {
    const row = db.prepare('SELECT 1 FROM admin_auth LIMIT 1').get();
    return row !== undefined;
  }

  function setPassword(password: string): void {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
    const stored = `${salt.toString('hex')}:${hash.toString('hex')}`;
    db.prepare('DELETE FROM admin_auth').run();
    db.prepare('INSERT INTO admin_auth (id, password_hash) VALUES (1, ?)').run(stored);
  }

  function verifyPassword(password: string): boolean {
    const row = db.prepare('SELECT password_hash FROM admin_auth LIMIT 1').get() as
      | { password_hash: string }
      | undefined;
    if (!row) return false;
    const [saltHex, hashHex] = row.password_hash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  function createSessionToken(secret: Buffer): string {
    const payload = Buffer.from(JSON.stringify({ issuedAt: Date.now() })).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${signature}`;
  }

  function verifySessionToken(token: string, secret: Buffer): boolean {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false;
    try {
      const { issuedAt } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return typeof issuedAt === 'number' && Date.now() - issuedAt < SESSION_MAX_AGE_MS;
    } catch {
      return false;
    }
  }

  return { isPasswordSet, setPassword, verifyPassword, createSessionToken, verifySessionToken };
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>;
