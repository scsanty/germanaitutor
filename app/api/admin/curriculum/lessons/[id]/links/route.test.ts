import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST } from './route';
import { DELETE } from './[otherId]/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/lessons/[id]/links', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-links-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g1', 'generic', 'A1', 'grammar', 'G1');
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-t1', 'telc', 'A1', 'grammar', 'T1');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-t1' }) }),
      { params: Promise.resolve({ id: 'a1-g1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('DELETE returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1-g1', otherId: 'a1-t1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('creates a link', async () => {
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-t1' }) }),
      { params: Promise.resolve({ id: 'a1-g1' }) }
    );
    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT 1 FROM lesson_concept_links').get();
    expect(row).toBeDefined();
  });

  it('returns 400 when the link is invalid (same track)', async () => {
    getDb().exec(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g2', 'generic', 'A1', 'grammar', 'G2')`
    );
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-g2' }) }),
      { params: Promise.resolve({ id: 'a1-g1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('removes a link', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-t1' }) }), {
      params: Promise.resolve({ id: 'a1-g1' }),
    });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'a1-g1', otherId: 'a1-t1' }),
    });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM lesson_concept_links').get()).toBeUndefined();
  });
});
