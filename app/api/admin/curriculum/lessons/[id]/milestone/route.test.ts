import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { PATCH } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function patch(body: unknown) {
  return PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'a' }),
  });
}

describe('PATCH /api/admin/curriculum/lessons/[id]/milestone', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-move-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    getDb().exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'One', 1), ('m2', 'generic', 'A1', 'Two', 2);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a', 'generic', 'A1', 'grammar', 'Alpha');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a', 'm1');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 without an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await patch({ milestoneId: 'm2' })).status).toBe(401);
  });

  it('moves the lesson, and rejects a bad body or milestone with 400', async () => {
    expect(await (await patch({ milestoneId: 'm2' })).json()).toEqual({ ok: true });
    expect(getDb().prepare("SELECT milestone_id FROM lesson_placements WHERE lesson_id = 'a'").get()).toEqual({ milestone_id: 'm2' });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ milestoneId: 'nope' })).status).toBe(400);
  });
});
