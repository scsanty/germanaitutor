import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET as getTracks } from './tracks/route';
import { GET as getTrackStructure } from './tracks/[track]/[level]/route';
import { GET as getLesson } from './lessons/[id]/route';

describe('/api/curriculum', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-curriculum-api-'));
    getDb().exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-m1', 'generic', 'A1', 'Basics', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('generic-a1-m1-s1', 'generic-a1-m1', 'Greetings', 0);
      INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES
        ('a1-present-tense-regular', 'generic', 'A1', 'grammar', 'Present tense', 'Explanation', '["ich lerne"]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-present-tense-regular', 'generic-a1-m1-s1', 0);
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('lists tracks', async () => {
    const res = await getTracks();
    expect(await res.json()).toEqual([{ track: 'generic', levels: ['A1'] }]);
  });

  it('returns a track structure', async () => {
    const res = await getTrackStructure(new Request('http://localhost'), {
      params: { track: 'generic', level: 'A1' },
    });
    const body = await res.json();
    expect(body[0].sections[0].lessons[0].id).toBe('a1-present-tense-regular');
  });

  it('returns a lesson with exercises and prerequisites', async () => {
    const res = await getLesson(new Request('http://localhost/api/curriculum/lessons/a1-present-tense-regular?track=generic'), {
      params: { id: 'a1-present-tense-regular' },
    });
    const body = await res.json();
    expect(body.lesson.id).toBe('a1-present-tense-regular');
    expect(body.exercises).toEqual([]);
    expect(body.prerequisites).toEqual([]);
    expect(body.conceptLinks).toEqual([]);
  });

  it('returns 404 for an unknown lesson', async () => {
    const res = await getLesson(new Request('http://localhost'), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });
});
