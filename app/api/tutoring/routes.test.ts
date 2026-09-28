import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { seedTutoringCurriculum, markComplete } from '@/test/tutoringFixtures';
import { createProfileService } from '@/lib/services/profileService';
import { GET as getTree } from './tree/route';
import { GET as getQueue } from './queue/route';
import { POST as postAttempt } from './attempts/route';
import { GET as getLesson } from './lessons/[id]/route';
import { POST as completeLesson } from './lessons/[id]/complete/route';

function attempt(body: unknown) {
  return postAttempt(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

function params(id: string) {
  return { params: { id } };
}

describe('/api/tutoring', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-tutoring-'));
    seedTutoringCurriculum(getDb());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('GET tree returns the active track+level', async () => {
    const tree = await (await getTree()).json();
    expect(tree).toMatchObject({ track: 'generic', level: 'A1' });
    expect(tree.milestones[0].sections[0].lessons.map((l: { id: string }) => l.id)).toEqual(['a1-greet', 'a1-sein']);
  });

  // M-3: an admin edit (here, deleting the level's last unfinished lesson) can finish a level
  // without a new completion ever being recorded; the tree load must still catch it up.
  it('GET tree unlocks the next level when an admin edit already finished the active one', async () => {
    const db = getDb();
    markComplete(db, 'a1-greet');
    db.prepare('DELETE FROM lessons WHERE id = ?').run('a1-sein');

    const tree = await (await getTree()).json();
    expect(tree.milestones[0].sections[0].lessons.map((l: { id: string }) => l.id)).toEqual(['a1-greet']);

    const profile = createProfileService(db).getProfile();
    expect(profile).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2' });
  });

  it('GET lesson returns the lesson, a locked view, or 404', async () => {
    const request = new Request('http://localhost');
    expect(await (await getLesson(request, params('a1-greet'))).json()).toMatchObject({ locked: false, id: 'a1-greet' });
    expect(await (await getLesson(request, params('a2-past'))).json()).toMatchObject({ locked: true, unlocksAfter: 'A1' });
    const missing = await getLesson(request, params('nope'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Lesson not found' });
  });

  it('POST attempts grades an answer', async () => {
    const res = await attempt({
      exerciseId: 'a1-greet__ex1',
      answer: { type: 'multiple_choice', selectedIndex: 0 },
      source: 'lesson',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: 'correct', correctAnswer: 'Hallo', lessonCompleted: false });
  });

  it('POST attempts answers 400, 404, and 403 for bad requests', async () => {
    const mc = { type: 'multiple_choice', selectedIndex: 0 };
    expect((await attempt({ exerciseId: 'a1-greet__ex1', answer: { type: 'multiple_choice' }, source: 'lesson' })).status).toBe(400);
    expect((await attempt({ exerciseId: 'a1-greet__ex1', answer: mc, source: 'freestyle' })).status).toBe(400);
    expect((await attempt({ exerciseId: 'nope', answer: mc, source: 'lesson' })).status).toBe(404);
    const locked = await attempt({ exerciseId: 'a2-past__ex1', answer: { type: 'fill_blank', text: 'war' }, source: 'lesson' });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toEqual({ error: 'Level A2 is locked' });
  });

  it('POST complete refuses a lesson that has exercises', async () => {
    const res = await completeLesson(new Request('http://localhost', { method: 'POST' }), params('a1-greet'));
    expect(res.status).toBe(400);
  });

  it("GET queue returns today's queue with a suggested lesson", async () => {
    expect(await (await getQueue()).json()).toMatchObject({
      cap: 50,
      answeredToday: 0,
      items: [],
      suggestedLesson: { id: 'a1-greet', title: 'Saying hello' },
    });
  });
});
