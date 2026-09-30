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
