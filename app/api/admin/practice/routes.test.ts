import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { addPracticeExercise, seedTutoringCurriculum } from '@/test/tutoringFixtures';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn() }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { GET } from './route';
import { PATCH } from './[id]/route';
import { POST as promote } from './[id]/promote/route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/admin/practice', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-practice-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    const db = getDb();
    seedTutoringCurriculum(db);
    addPracticeExercise(db, 'px-1', 'a1-greet');
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('requires an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await GET(new Request('http://localhost/api/admin/practice'))).status).toBe(401);
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: '{}' }), ctx('px-1'))).status).toBe(401);
    expect((await promote(new Request('http://localhost', { method: 'POST' }), ctx('px-1'))).status).toBe(401);
  });

  it('lists, approves, edits and promotes', async () => {
    const listed = await (await GET(new Request('http://localhost/api/admin/practice?status=unreviewed&track=generic&level=A1'))).json();
    expect(listed.map((i: { id: string }) => i.id)).toEqual(['px-1']);

    const approved = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) }), ctx('px-1'));
    expect((await approved.json()).reviewStatus).toBe('approved');

    const bad = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ action: 'maybe' }) }), ctx('px-1'));
    expect(bad.status).toBe(400);

    const promoted = await promote(new Request('http://localhost', { method: 'POST' }), ctx('px-1'));
    expect((await promoted.json()).exerciseId).toMatch(/^a1-greet__ex-/);

    const gone = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) }), ctx('px-1'));
    expect(gone.status).toBe(404);
  });
});
