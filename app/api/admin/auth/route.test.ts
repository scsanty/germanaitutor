import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb } from '@/lib/db/client';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

import { GET, POST, DELETE } from './route';

describe('/api/admin/auth', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-auth-'));
    cookieStore.clear();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('reports passwordSet=false and authenticated=false initially', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ passwordSet: false, authenticated: false });
  });

  it('sets the password on first POST and authenticates', async () => {
    const setupRes = await POST(
      new Request('http://localhost/api/admin/auth', { method: 'POST', body: JSON.stringify({ password: 'hunter2' }) })
    );
    expect((await setupRes.json()).ok).toBe(true);
    expect(cookieStore.has('admin_session')).toBe(true);

    const statusRes = await GET();
    expect(await statusRes.json()).toEqual({ passwordSet: true, authenticated: true });
  });

  it('rejects a wrong password on a subsequent login attempt', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ password: 'hunter2' }) }));
    cookieStore.clear();
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })
    );
    expect(res.status).toBe(401);
    expect(cookieStore.has('admin_session')).toBe(false);
  });

  it('clears the session cookie on DELETE', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ password: 'hunter2' }) }));
    expect(cookieStore.has('admin_session')).toBe(true);
    await DELETE();
    expect(cookieStore.has('admin_session')).toBe(false);
  });
});
