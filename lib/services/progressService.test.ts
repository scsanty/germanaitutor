import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { addAttempt, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  return { db, progress: createProgressService(db), profiles: createProfileService(db) };
}

function lessonsOf(tree: ReturnType<ReturnType<typeof createProgressService>['getTree']>) {
  return tree.milestones.flatMap((m) => m.sections.flatMap((s) => s.lessons));
}

describe('progressService.getTree', () => {
  it('lists the active track+level in tree order and hides the Unsorted bucket', () => {
    const { db, progress } = setup();
    const { sectionId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hidden', 'generic', 'A1', 'grammar', 'Hidden');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-hidden', '${sectionId}', 0);
    `);

    const tree = progress.getTree();
    expect(tree).toMatchObject({ track: 'generic', level: 'A1' });
    expect(tree.milestones.map((m) => m.title)).toEqual(['Basics']);
    expect(tree.milestones[0].sections.map((s) => s.title)).toEqual(['Greetings']);
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

  it('warns about unfinished prerequisites, counting shared completion as done', () => {
    const { db, progress } = setup();
    const sein = () => lessonsOf(progress.getTree()).find((l) => l.id === 'a1-sein');
    expect(sein()?.missingPrerequisites).toEqual([{ id: 'a1-greet', title: 'Saying hello' }]);
    markComplete(db, 'a1-goethe-greet');
    expect(sein()?.missingPrerequisites).toEqual([]);
  });
});

describe('progressService.isLevelFinished', () => {
  it('needs every visible lesson done, own or shared, and ignores Unsorted', () => {
    const { db, progress } = setup();
    const { sectionId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hidden', 'generic', 'A1', 'grammar', 'Hidden');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-hidden', '${sectionId}', 0);
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
      locked: true,
      id: 'a2-past',
      title: 'The past of sein',
      level: 'A2',
      unlocksAfter: 'A1',
    });
  });

  it('returns content, exercises in authored order without answers, progress, and prerequisites', () => {
    const { db, progress } = setup();
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
      prerequisites: [{ id: 'a1-greet', title: 'Saying hello', done: false }],
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
