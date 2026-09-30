import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync, strFromU8 } from 'fflate';
import { closeDb, getDb } from '@/lib/db/client';
import { ensureUnsortedExists } from '@/lib/curriculum-admin/unsortedBucket';
import { GET as exportAll } from './route';
import { GET as exportOne } from './[track]/[level]/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function one(track: string, level: string) {
  return exportOne(new Request('http://localhost'), { params: Promise.resolve({ track, level }) });
}

describe('/api/admin/curriculum/export', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-export-routes-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await exportAll()).status).toBe(401);
    expect((await one('generic', 'A1')).status).toBe(401);
  });

  it('downloads a zip of all 15 seed files', async () => {
    const res = await exportAll();
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="curriculum-seed.zip"');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(15);
    expect(JSON.parse(strFromU8(files['goethe-b1.json']))).toMatchObject({ track: 'goethe', level: 'B1' });
  });

  it('downloads one track+level file', async () => {
    const res = await one('telc', 'A2');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="telc-a2.json"');
    expect(await res.json()).toMatchObject({ track: 'telc', level: 'A2' });
  });

  it('rejects an unknown track or level', async () => {
    expect((await one('duolingo', 'A1')).status).toBe(400);
    expect((await one('generic', 'C2')).status).toBe(400);
  });

  it('answers 409 with the problems when a lesson has no German title', async () => {
    ensureUnsortedExists(getDb(), 'generic', 'A1');
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES ('old-lesson', 'generic', 'A1', 'grammar', 'Old', '');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('old-lesson', 'generic-a1-unsorted');
    `);
    const single = await one('generic', 'A1');
    expect(single.status).toBe(409);
    expect((await single.json()).error).toContain('lesson old-lesson: German title is required');
    expect((await exportAll()).status).toBe(409);
  });
});
