import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST } from './route';
import { GET, PATCH, DELETE } from './[id]/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/milestones', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-milestones-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when not authenticated (PATCH rename)', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'X', titleDe: 'X', description: null, descriptionDe: null }) }),
      { params: Promise.resolve({ id: 'some-id' }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when not authenticated (DELETE)', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: 'some-id' }) });
    expect(res.status).toBe(401);
  });

  it('creates a milestone', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 1 }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Basics');
  });

  it('renames a milestone', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 1 }),
        })
      )
    ).json();

    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'Fundamentals', titleDe: 'Grundlagen 2', description: null, descriptionDe: null, difficultyRank: 2 }) }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'Fundamentals', difficultyRank: 2 });
  });

  it('deletes a milestone', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 1 }),
        })
      )
    ).json();

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: created.id }) });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM milestones WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it('rejects a milestone without a whole-number rank', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 0 }),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/whole number/);
  });

  it('previews which lessons a milestone delete would move to Unsorted', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 1 }),
        })
      )
    ).json();
    getDb().exec(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('l1', '${created.id}');`);

    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: created.id }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lessons: [{ id: 'l1', title: 'L1' }] });
  });

  it('returns 401 when not authenticated (GET preview)', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'some-id' }) });
    expect(res.status).toBe(401);
  });
});
