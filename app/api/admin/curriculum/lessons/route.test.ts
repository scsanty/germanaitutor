import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST, DELETE } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function seedMilestoneAndSection() {
  getDb().exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
  `);
}

describe('/api/admin/curriculum/lessons', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-lessons-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(401);
  });

  it('creates a lesson', async () => {
    seedMilestoneAndSection();
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'modal-verbs',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Modal Verbs',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 's1' },
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('a1-modal-verbs');
  });

  it('returns 400 with an error message when creation fails', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'modal-verbs',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Modal Verbs',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 'nonexistent-section' },
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  it('batch deletes a set of lessons', async () => {
    seedMilestoneAndSection();
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l2', 'generic', 'A1', 'grammar', 'L2');
    `);
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({ lessonIds: ['a1-l1', 'a1-l2'] }) })
    );
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-l1')).toBeUndefined();
  });

  it('returns 400 when a batch delete id does not exist', async () => {
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({ lessonIds: ['nope'] }) })
    );
    expect(res.status).toBe(400);
  });
});
