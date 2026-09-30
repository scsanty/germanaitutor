import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createPracticeAdminService, PracticeAdminError } from './practiceAdminService';
import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  const admin = createPracticeAdminService(db, { now: () => new Date('2026-09-30T08:00:00.000Z') });
  return { db, admin };
}

function kindOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (err) {
    return (err as PracticeAdminError).kind;
  }
  return undefined;
}

describe('practiceAdminService', () => {
  it('lists pool exercises with their lesson, oldest first, filtered by status, track, level and lesson', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-2', 'a1-greet', { createdAt: '2026-09-29T10:00:02.000Z' });
    addPracticeExercise(db, 'px-1', 'a1-greet', { createdAt: '2026-09-29T10:00:01.000Z' });
    addPracticeExercise(db, 'px-3', 'a1-goethe-greet', { status: 'approved' });
    expect(admin.list({ status: 'unreviewed' }).map((i) => i.id)).toEqual(['px-1', 'px-2']);
    expect(admin.list({ track: 'goethe', level: 'A1' }).map((i) => i.id)).toEqual(['px-3']);
    expect(admin.list({ lessonId: 'a1-greet' }).map((i) => i.id)).toEqual(['px-1', 'px-2']);
    expect(admin.list({ status: 'unreviewed' })[0]).toEqual({
      id: 'px-1',
      lessonId: 'a1-greet',
      lessonTitle: 'Saying hello',
      track: 'generic',
      level: 'A1',
      type: 'multiple_choice',
      content: { question: 'Question px-1?', options: ['ja', 'nein'], correctIndex: 0 },
      correctAnswer: 'ja',
      reviewStatus: 'unreviewed',
      createdAt: '2026-09-29T10:00:01.000Z',
      reviewedAt: null,
    });
  });

  it('approves and rejects', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-1', 'a1-greet');
    expect(admin.setStatus('px-1', 'approved')).toMatchObject({ reviewStatus: 'approved', reviewedAt: '2026-09-30T08:00:00.000Z' });
    expect(admin.setStatus('px-1', 'rejected')).toMatchObject({ reviewStatus: 'rejected' });
    expect(() => admin.setStatus('nope', 'approved')).toThrow(PracticeAdminError);
  });

  it('edits content in place, keeping the type and approving it, and rejects invalid content', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-1', 'a1-greet');
    const edited = admin.editContent('px-1', { question: 'Fixed?', options: ['ja', 'nein'], correctIndex: 1 });
    expect(edited).toMatchObject({ type: 'multiple_choice', reviewStatus: 'approved', correctAnswer: 'nein' });
    expect(kindOf(() => admin.editContent('px-1', { question: '', options: ['ja'], correctIndex: 0 }))).toBe('bad_request');
  });

  it('refuses content with an instruction, since the pool is German-only', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-1', 'a1-greet');
    const content = { question: 'Fixed?', options: ['ja', 'nein'], correctIndex: 1, instruction: { en: 'Pick.', de: 'Wähle.' } };
    expect(kindOf(() => admin.editContent('px-1', content))).toBe('bad_request');
    expect(() => admin.editContent('px-1', content)).toThrow('cannot have an instruction');
  });

  it('promotes into the lesson’s authored exercises, keeps the completion, and leaves the pool', () => {
    const { db, admin } = setup();
    markComplete(db, 'a1-greet');
    addPracticeExercise(db, 'px-1', 'a1-greet');
    const { exerciseId } = admin.promote('px-1');
    expect(exerciseId).toMatch(/^a1-greet__ex-[0-9a-f]{6}$/);
    expect(db.prepare('SELECT lesson_id, type FROM exercises WHERE id = ?').get(exerciseId)).toEqual({
      lesson_id: 'a1-greet',
      type: 'multiple_choice',
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM practice_exercises WHERE id = 'px-1'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM lesson_completions WHERE lesson_id = 'a1-greet'").get()).toEqual({ n: 1 });
  });

  it('refuses to promote a flashcard into a non-vocabulary lesson', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-card', 'a1-sein', { type: 'flashcard', content: { front: 'a', back: 'b' } });
    expect(kindOf(() => admin.promote('px-card'))).toBe('bad_request');
    expect(db.prepare("SELECT COUNT(*) AS n FROM practice_exercises WHERE id = 'px-card'").get()).toEqual({ n: 1 });
  });
});
