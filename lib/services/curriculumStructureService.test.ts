import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumStructureService } from './curriculumStructureService';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, milestoneId: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
  db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run(id, milestoneId);
}

describe('curriculumStructureService — milestones', () => {
  it('creates, updates and ranks milestones, and refuses bad ranks and Unsorted edits', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m = service.createMilestone('generic', 'A1', 'Basics', null, 2);
    expect(m).toMatchObject({ title: 'Basics', difficultyRank: 2 });
    expect(service.updateMilestone(m.id, { title: 'Start', description: 'd', difficultyRank: 1 })).toMatchObject({
      title: 'Start',
      description: 'd',
      difficultyRank: 1,
    });
    expect(() => service.createMilestone('generic', 'A1', 'X', null, 1.5)).toThrow(/whole number/);
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    expect(() => service.updateMilestone(milestoneId, { title: 'U', description: null, difficultyRank: 1 })).toThrow(/Unsorted/);
  });

  it('moves a deleted milestone’s lessons to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m = service.createMilestone('generic', 'A1', 'Basics', null, 1);
    db.exec(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('l1', '${m.id}');`);
    expect(service.previewMilestoneDelete(m.id)).toEqual({ lessons: [{ id: 'l1', title: 'L1' }] });
    service.deleteMilestone(m.id);
    expect(db.prepare('SELECT milestone_id FROM lesson_placements WHERE lesson_id = ?').get('l1')).toEqual({
      milestone_id: 'generic-a1-unsorted',
    });
  });

  it('previewMilestoneDelete lists every lesson that would move to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null, 1);
    insertLesson(db, 'a1-lesson-one', milestone.id);

    expect(service.previewMilestoneDelete(milestone.id)).toEqual({
      lessons: [{ id: 'a1-lesson-one', title: 'a1-lesson-one' }],
    });
  });

  it('deleteMilestone relocates all its lessons to Unsorted, then removes it', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null, 1);
    insertLesson(db, 'a1-l1', milestone.id);
    insertLesson(db, 'a1-l2', milestone.id);

    service.deleteMilestone(milestone.id);

    const placements = db
      .prepare(
        `SELECT lp.lesson_id, m.title as milestone_title FROM lesson_placements lp
         JOIN milestones m ON m.id = lp.milestone_id
         ORDER BY lp.lesson_id`
      )
      .all() as { lesson_id: string; milestone_title: string }[];
    expect(placements).toEqual([
      { lesson_id: 'a1-l1', milestone_title: 'Unsorted' },
      { lesson_id: 'a1-l2', milestone_title: 'Unsorted' },
    ]);
    expect(db.prepare('SELECT 1 FROM milestones WHERE id = ?').get(milestone.id)).toBeUndefined();
  });

  it('rejects deleting the Unsorted milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    expect(() => service.deleteMilestone(milestoneId)).toThrow(/Unsorted/);
  });
});

describe('scope checks on structure edits', () => {
  function setup() {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'One', 1),
        ('m2', 'generic', 'A1', 'Two', 2), ('m9', 'generic', 'A2', 'Elsewhere', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a', 'generic', 'A1', 'grammar', 'Alpha'),
        ('b', 'generic', 'A1', 'grammar', 'Beta');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a', 'm1'), ('b', 'm2');
      INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('b', 'a');
    `);
    return { db, service: createCurriculumStructureService(db) };
  }

  // Review Focus 5: lowering a rank below a milestone its lessons depend on is refused, and nothing changes.
  it('refuses a rank change that breaks the scope rule and keeps the old rank', () => {
    const { db, service } = setup();
    expect(() => service.updateMilestone('m2', { title: 'Two', description: null, difficultyRank: 1 })).toThrow(
      'Beta builds on Alpha, which is in a later or parallel milestone'
    );
    expect(db.prepare("SELECT difficulty_rank FROM milestones WHERE id = 'm2'").get()).toEqual({ difficulty_rank: 2 });
  });

  it('moves a lesson to another milestone of its track+level, checking scope', () => {
    const { db, service } = setup();
    service.moveLesson('a', 'm2'); // same milestone as its dependent: allowed
    expect(db.prepare("SELECT milestone_id FROM lesson_placements WHERE lesson_id = 'a'").get()).toEqual({ milestone_id: 'm2' });
    expect(() => service.moveLesson('b', 'm1')).toThrow(/later or parallel/);
    expect(() => service.moveLesson('a', 'm9')).toThrow(/belongs to generic\/A2/);
    expect(() => service.moveLesson('a', 'nope')).toThrow(/not found/);
  });
});
