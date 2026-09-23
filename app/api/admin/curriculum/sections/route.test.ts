import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { PATCH as reorder } from './reorder/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/sections', () => {
  let milestoneId: string;

  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-sections-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    milestoneId = 'm1';
    getDb().exec(
      `INSERT INTO milestones (id, track, level, title, order_index) VALUES ('${milestoneId}', 'generic', 'A1', 'M1', 0)`
    );
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when not authenticated (PATCH rename)', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'X', description: null }) }),
      { params: { id: 'some-id' } }
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when not authenticated (DELETE)', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'some-id' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when not authenticated (PATCH reorder)', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await reorder(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ milestoneId, orderedIds: [] }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('creates a section', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ milestoneId, title: 'S1', description: null }),
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).title).toBe('S1');
  });

  it('renames a section', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ milestoneId, title: 'S1', description: null }),
        })
      )
    ).json();

    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'Section One', description: null }) }),
      { params: { id: created.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Section One');
  });

  it('deletes a section', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ milestoneId, title: 'S1', description: null }),
        })
      )
    ).json();

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: created.id } });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM sections WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it('reorders sections within a milestone', async () => {
    const s1 = await (
      await POST(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify({ milestoneId, title: 'S1', description: null }) })
      )
    ).json();
    const s2 = await (
      await POST(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify({ milestoneId, title: 'S2', description: null }) })
      )
    ).json();

    const res = await reorder(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ milestoneId, orderedIds: [s2.id, s1.id] }),
      })
    );
    expect(res.status).toBe(200);
    const rows = getDb()
      .prepare('SELECT id FROM sections WHERE milestone_id = ? ORDER BY order_index')
      .all(milestoneId) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([s2.id, s1.id]);
  });

  it('reorders sections, rejecting a payload for the Unsorted milestone', async () => {
    const unsortedMilestoneId = 'generic-a1-unsorted';
    const unsortedSectionId = `${unsortedMilestoneId}-section`;
    getDb().exec(
      `INSERT INTO milestones (id, track, level, title, order_index) VALUES ('${unsortedMilestoneId}', 'generic', 'A1', 'Unsorted', 0)`
    );
    getDb().exec(
      `INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('${unsortedSectionId}', '${unsortedMilestoneId}', 'Unsorted', 0)`
    );

    const res = await reorder(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ milestoneId: unsortedMilestoneId, orderedIds: [unsortedSectionId] }),
      })
    );
    expect(res.status).toBe(400);
  });
});
