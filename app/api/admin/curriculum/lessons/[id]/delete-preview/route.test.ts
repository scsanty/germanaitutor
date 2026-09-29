import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/lessons/[id]/delete-preview', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-delete-preview-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'a1-l1' }) });
    expect(res.status).toBe(401);
  });

  it('returns the repair preview and linked lessons', async () => {
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'a1-l1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repair.edgesToAdd).toEqual([]);
    expect(body.linkedLessons).toEqual([]);
  });

  it('returns 404 for an unknown lesson', async () => {
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
