import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { addSecondMilestone, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { GET, POST } from './[id]/testout/route';
import { POST as ANSWER } from './[id]/testout/answer/route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/tutoring/milestones/[id]/testout', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-testout-'));
    const db = getDb();
    seedTutoringCurriculum(db);
    addSecondMilestone(db);
    db.exec(`
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-late__ex3', 'a1-late', 'multiple_choice', '{"question":"Q3?","options":["ja","nein"],"correctIndex":0}');
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-late2', 'generic', 'A1', 'grammar', 'Later two'),
        ('a1-late3', 'generic', 'A1', 'grammar', 'Later three');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-late2', 'g-a1-m2'), ('a1-late3', 'g-a1-m2');
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-late2__ex1', 'a1-late2', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}'),
        ('a1-late2__ex2', 'a1-late2', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}'),
        ('a1-late3__ex1', 'a1-late3', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('reports state, starts, and takes answers', async () => {
    expect(await (await GET(new Request('http://localhost'), ctx('g-a1-m2'))).json()).toMatchObject({ status: { status: 'available' } });
    const run = await (await POST(new Request('http://localhost', { method: 'POST' }), ctx('g-a1-m2'))).json();
    expect(run.questions.length).toBeGreaterThanOrEqual(5);
    const first = run.questions[0];
    const answer = first.type === 'multiple_choice' ? { type: 'multiple_choice', selectedIndex: 0 } : { type: 'fill_blank', text: 'bin' };
    const res = await ANSWER(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ exerciseId: first.id, answer }) }),
      ctx('g-a1-m2')
    );
    expect(await res.json()).toEqual({ finished: false, answered: 1, total: run.questions.length });
  });

  it('maps errors to status codes and codes', async () => {
    const unavailable = await POST(new Request('http://localhost', { method: 'POST' }), ctx('g-a1-m1'));
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toMatchObject({ code: 'testout_unavailable' });
    expect((await GET(new Request('http://localhost'), ctx('nope'))).status).toBe(404);
    const bad = await ANSWER(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ exerciseId: 7 }) }), ctx('g-a1-m2'));
    expect(bad.status).toBe(400);
  });
});
