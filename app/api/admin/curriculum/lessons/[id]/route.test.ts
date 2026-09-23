import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { PATCH } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/lessons/[id]', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-lesson-id-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    getDb().exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-l1', 's1', 0);
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }), {
      params: { id: 'a1-l1' },
    });
    expect(res.status).toBe(401);
  });

  it('updates a lesson', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 Updated',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 's1' },
        }),
      }),
      { params: { id: 'a1-l1' } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('L1 Updated');
  });

  it('returns 404 for an unknown lesson id', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'X',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 's1' },
        }),
      }),
      { params: { id: 'nope' } }
    );
    expect(res.status).toBe(404);
  });
});
