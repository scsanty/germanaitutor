import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { addAttempt, addSecondMilestone, markComplete, scheduleReview, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  return { db, progress: createProgressService(db), profiles: createProfileService(db) };
}

function lessonsOf(tree: ReturnType<ReturnType<typeof createProgressService>['getTree']>) {
  return tree.milestones.flatMap((m) => m.lessons);
}

describe('progressService.getTree', () => {
  it('lists the active track+level in tree order and hides the Unsorted bucket', () => {
    const { db, progress } = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hidden', 'generic', 'A1', 'grammar', 'Hidden');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-hidden', '${milestoneId}');
    `);

    const tree = progress.getTree();
    expect(tree).toMatchObject({ track: 'generic', level: 'A1' });
    expect(tree.milestones.map((m) => m.title)).toEqual(['Basics']);
    expect(lessonsOf(tree).map((l) => l.id)).toEqual(['a1-greet', 'a1-sein']);
  });

  it('shows not started, in progress, and complete', () => {
    const { db, progress } = setup();
    expect(lessonsOf(progress.getTree()).map((l) => l.status)).toEqual(['not_started', 'not_started']);
    addAttempt(db, 'a1-sein__ex2', 'wrong');
    markComplete(db, 'a1-greet');
    expect(lessonsOf(progress.getTree()).map((l) => l.status)).toEqual(['complete', 'in_progress']);
  });

  it('shows a lesson completed through a concept link as covered via that track', () => {
    const { db, progress, profiles } = setup();
    markComplete(db, 'a1-greet');
    profiles.updateProfile({ activeTrack: 'goethe' });
    expect(lessonsOf(progress.getTree())).toEqual([
      expect.objectContaining({ id: 'a1-goethe-greet', status: 'covered', coveredVia: 'generic' }),
    ]);
  });

  it('locks a lesson until its prerequisites are done, counting shared completion, and lays out branches', () => {
    const { db, progress } = setup();
    const lesson = (id: string) => progress.getTree().milestones.flatMap((m) => m.lessons).find((l) => l.id === id)!;
    expect(lesson('a1-greet')).toMatchObject({ locked: false, branch: 0, column: 0, row: 0 });
    expect(lesson('a1-sein')).toMatchObject({ locked: true, branch: 0, column: 0, row: 1 });
    expect(progress.getTree().milestones[0].edges).toEqual([{ from: 'a1-greet', to: 'a1-sein' }]);
    markComplete(db, 'a1-goethe-greet');
    expect(lesson('a1-sein').locked).toBe(false);
  });

  it('ranks milestones, gates the next rank, shows earlier prerequisites as chips, and reports the test-out', () => {
    const { db, progress } = setup();
    addSecondMilestone(db);
    db.exec("INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('a1-late', 'a1-greet')");
    const tree = progress.getTree();
    expect(tree.milestones.map((m) => [m.id, m.rank, m.state])).toEqual([
      ['g-a1-m1', 1, 'open'],
      ['g-a1-m2', 2, 'locked'],
    ]);
    expect(tree.milestones[1].lessons[0]).toMatchObject({
      id: 'a1-late',
      locked: true,
      earlierPrerequisites: [{ id: 'a1-greet', title: 'Saying hello', done: false }],
    });
    // a1-late has only two eligible exercises, so the draw would be too small.
    expect(tree.milestones[1].testOut).toEqual({ status: 'too_few_questions' });
    expect(tree.milestones[0].testOut).toEqual({ status: 'none' });
  });
});

describe('progressService.isLevelFinished', () => {
  it('needs every visible lesson done, own or shared, and ignores Unsorted', () => {
    const { db, progress } = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hidden', 'generic', 'A1', 'grammar', 'Hidden');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-hidden', '${milestoneId}');
    `);
    expect(progress.isLevelFinished('generic', 'A1')).toBe(false);
    markComplete(db, 'a1-goethe-greet');
    expect(progress.isLevelFinished('generic', 'A1')).toBe(false);
    markComplete(db, 'a1-sein');
    expect(progress.isLevelFinished('generic', 'A1')).toBe(true);
  });

  it('never counts a level without visible lessons as finished', () => {
    const { progress } = setup();
    expect(progress.isLevelFinished('telc', 'A1')).toBe(false);
  });
});

describe('progressService.getLessonView', () => {
  it('returns null for an unknown lesson', () => {
    expect(setup().progress.getLessonView('nope')).toBeNull();
  });

  it('shows a lesson above the unlocked range as locked', () => {
    expect(setup().progress.getLessonView('a2-past')).toEqual({
      locked: 'level',
      id: 'a2-past',
      title: 'The past of sein',
      level: 'A2',
      unlocksAfter: 'A1',
    });
  });

  it('does not list a prerequisite that sits in Unsorted', () => {
    const { db, progress } = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.prepare('UPDATE lesson_placements SET milestone_id = ? WHERE lesson_id = ?').run(milestoneId, 'a1-greet');
    expect(progress.getLessonView('a1-sein')).toMatchObject({ locked: false, prerequisites: [] });
  });

  it('returns content, exercises in authored order without answers, progress, and prerequisites', () => {
    const { db, progress } = setup();
    markComplete(db, 'a1-greet');
    addAttempt(db, 'a1-sein__ex10', 'wrong');
    addAttempt(db, 'a1-sein__ex10', 'almost');
    const view = progress.getLessonView('a1-sein');
    expect(view).toEqual({
      locked: false,
      id: 'a1-sein',
      title: 'The verb sein',
      track: 'generic',
      level: 'A1',
      skill: 'grammar',
      explanation: 'ich bin, du bist',
      examples: null,
      exercises: [
        { id: 'a1-sein__ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' },
        { id: 'a1-sein__ex10', type: 'free_text', prompt: 'Say that you are tired.' },
      ],
      passedExerciseIds: ['a1-sein__ex10'],
      completed: false,
      prerequisites: [{ id: 'a1-greet', title: 'Saying hello', done: true }],
    });
  });

  it('reports a completed lesson', () => {
    const { db, progress } = setup();
    markComplete(db, 'a1-greet');
    expect(progress.getLessonView('a1-greet')).toMatchObject({ locked: false, completed: true });
    expect(progress.isCompleted('a1-greet')).toBe(true);
    expect(progress.isCompleted('a1-sein')).toBe(false);
  });
});

describe('progressService.getDailyQueue', () => {
  const today = '2026-09-24';

  it('lists due exercises of the active track+level, most overdue first, including Unsorted', () => {
    const { db, progress } = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`UPDATE lesson_placements SET milestone_id = '${milestoneId}' WHERE lesson_id = 'a1-sein'`);
    scheduleReview(db, 'a1-greet__ex1', '2026-09-24');
    scheduleReview(db, 'a1-sein__ex2', '2026-09-20');
    scheduleReview(db, 'a1-greet__ex2', '2026-09-25');
    scheduleReview(db, 'a1-goethe-greet__ex1', '2026-09-01');

    const queue = progress.getDailyQueue(today);
    expect(queue).toMatchObject({ track: 'generic', level: 'A1', cap: 50, answeredToday: 0 });
    expect(queue.items).toEqual([
      {
        lessonId: 'a1-sein',
        lessonTitle: 'The verb sein',
        exercise: { id: 'a1-sein__ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' },
      },
      {
        lessonId: 'a1-greet',
        lessonTitle: 'Saying hello',
        exercise: { id: 'a1-greet__ex1', type: 'multiple_choice', question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'] },
      },
    ]);
  });

  it('counts queue answers today against the cap and drops what was already answered', () => {
    const { db, progress, profiles } = setup();
    profiles.updateProfile({ dailyReviewCap: 2 });
    scheduleReview(db, 'a1-greet__ex1', '2026-09-20');
    scheduleReview(db, 'a1-greet__ex2', '2026-09-21');
    scheduleReview(db, 'a1-sein__ex2', '2026-09-22');
    addAttempt(db, 'a1-greet__ex1', 'correct', { source: 'queue', on: today });
    addAttempt(db, 'a1-sein__ex2', 'correct', { source: 'lesson', on: today });

    const queue = progress.getDailyQueue(today);
    expect(queue.answeredToday).toBe(1);
    expect(queue.items.map((i) => i.exercise.id)).toEqual(['a1-greet__ex2']);
  });

  it('suggests the first incomplete lesson whose prerequisites are done', () => {
    const { db, progress } = setup();
    expect(progress.getDailyQueue(today).suggestedLesson).toEqual({ id: 'a1-greet', title: 'Saying hello' });
    markComplete(db, 'a1-greet');
    expect(progress.getDailyQueue(today).suggestedLesson).toEqual({ id: 'a1-sein', title: 'The verb sein' });
    markComplete(db, 'a1-sein');
    expect(progress.getDailyQueue(today).suggestedLesson).toBeNull();
  });
});

describe('progressService.getLessonView locks', () => {
  it('returns a lesson-locked view naming the reason, and the open view once unlocked', () => {
    const { db, progress } = setup();
    addSecondMilestone(db);
    expect(progress.getLessonView('a1-late')).toEqual({
      locked: 'lesson',
      id: 'a1-late',
      title: 'A later lesson',
      level: 'A1',
      reason: 'milestone',
      milestone: { id: 'g-a1-m1', title: 'Basics' },
      missingPrerequisites: [],
    });
    markComplete(db, 'a1-greet');
    markComplete(db, 'a1-sein');
    expect(progress.getLessonView('a1-late')).toMatchObject({ locked: false, id: 'a1-late' });
  });

  it('suggests the first open lesson that is not done', () => {
    const { db, progress } = setup();
    addSecondMilestone(db);
    markComplete(db, 'a1-greet');
    expect(progress.getDailyQueue('2026-09-29').suggestedLesson).toEqual({ id: 'a1-sein', title: 'The verb sein' });
  });
});
