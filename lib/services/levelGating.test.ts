import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';
import { lessonLock, loadLevelGating } from './levelGating';
import { addSecondMilestone, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  addSecondMilestone(db);
  return db;
}

describe('loadLevelGating', () => {
  it('opens the first rank, locks the next, and orders lessons by rank then branch', () => {
    const gating = loadLevelGating(setup(), 'generic', 'A1');
    expect(gating.milestones.map((m) => [m.id, m.rank])).toEqual([
      ['g-a1-m1', 1],
      ['g-a1-m2', 2],
    ]);
    expect(Object.fromEntries(gating.states)).toEqual({ 'g-a1-m1': 'open', 'g-a1-m2': 'locked' });
    expect(gating.nextLockedRank).toBe(2);
    expect(gating.lessonsInTreeOrder()).toEqual(['a1-greet', 'a1-sein', 'a1-late']);
  });
});

describe('lessonLock', () => {
  it('ignores a prerequisite that sits in a higher rank', () => {
    const db = setup();
    db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run('a1-greet', 'a1-late');
    expect(loadLevelGating(db, 'generic', 'A1').prerequisitesOf('a1-greet')).toEqual([]);
    expect(lessonLock(db, 'a1-greet')).toEqual({ locked: false });
  });

  it('locks a lesson until its prerequisites are done', () => {
    const db = setup();
    expect(lessonLock(db, 'a1-greet')).toEqual({ locked: false });
    expect(lessonLock(db, 'a1-sein')).toEqual({
      locked: true,
      reason: 'prerequisites',
      milestone: { id: 'g-a1-m1', title: 'Basics' },
      missingPrerequisites: [{ id: 'a1-greet', title: 'Saying hello' }],
    });
    markComplete(db, 'a1-greet');
    expect(lessonLock(db, 'a1-sein')).toEqual({ locked: false });
  });

  it('counts a lesson covered through a concept link as done', () => {
    const db = setup();
    markComplete(db, 'a1-goethe-greet'); // concept-linked to a1-greet
    expect(lessonLock(db, 'a1-sein')).toEqual({ locked: false });
  });

  it('locks every lesson of a locked milestone, but never a completed one', () => {
    const db = setup();
    expect(lessonLock(db, 'a1-late')).toMatchObject({ locked: true, reason: 'milestone', milestone: { id: 'g-a1-m1', title: 'Basics' } });
    markComplete(db, 'a1-late');
    expect(lessonLock(db, 'a1-late')).toEqual({ locked: false });
  });

  it('opens the next rank once every lesson of the first is done', () => {
    const db = setup();
    markComplete(db, 'a1-greet');
    markComplete(db, 'a1-sein');
    expect(lessonLock(db, 'a1-late')).toEqual({ locked: false });
  });

  // Review Focus 4: a prerequisite that sits in Unsorted never locks a lesson.
  it('ignores a prerequisite shelved in Unsorted', () => {
    const db = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-shelf', 'generic', 'A1', 'grammar', 'Shelved');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-shelf', '${milestoneId}');
      DELETE FROM lesson_prerequisites WHERE lesson_id = 'a1-sein';
      INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('a1-sein', 'a1-shelf');`);
    expect(lessonLock(db, 'a1-sein')).toEqual({ locked: false });
  });

  it('never locks a lesson in Unsorted or one without a placement', () => {
    const db = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.prepare("UPDATE lesson_placements SET milestone_id = ? WHERE lesson_id = 'a1-late'").run(milestoneId);
    expect(lessonLock(db, 'a1-late')).toEqual({ locked: false });
  });
});
