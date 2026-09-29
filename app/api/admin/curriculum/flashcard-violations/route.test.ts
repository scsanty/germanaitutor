import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/flashcard-violations', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-violations-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await GET()).status).toBe(401);
  });

  it('lists the violations', async () => {
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g', 'generic', 'A1', 'grammar', 'G');
      INSERT INTO exercises (id, lesson_id, type, content) VALUES ('e1', 'a1-g', 'flashcard', '{}');
    `);
    expect(await (await GET()).json()).toEqual([
      { lessonId: 'a1-g', title: 'G', track: 'generic', level: 'A1', skill: 'grammar', flashcardCount: 1 },
    ]);
  });
});
