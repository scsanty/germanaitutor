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

describe('/api/admin/curriculum/milestones', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-milestones-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
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

  it('creates a milestone', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', description: null }),
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
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', description: null }),
        })
      )
    ).json();

    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'Fundamentals', description: null }) }),
      { params: { id: created.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Fundamentals');
  });

  it('deletes a milestone', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', description: null }),
        })
      )
    ).json();

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: created.id } });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM milestones WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it('reorders milestones, rejecting a payload that includes Unsorted', async () => {
    const m1 = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'M1', description: null }),
        })
      )
    ).json();

    const res = await reorder(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ track: 'generic', level: 'A1', orderedIds: [m1.id, 'generic-a1-unsorted'] }),
      })
    );
    expect(res.status).toBe(400);
  });
});
