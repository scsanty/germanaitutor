import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumStructureService } from './curriculumStructureService';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, sectionId: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
  db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, 0)').run(id, sectionId);
}

describe('curriculumStructureService — milestones', () => {
  it('creates and renames a milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const created = service.createMilestone('generic', 'A1', 'Basics', null);
    expect(created.title).toBe('Basics');

    const renamed = service.renameMilestone(created.id, 'Fundamentals', 'desc');
    expect(renamed.title).toBe('Fundamentals');
    expect(renamed.description).toBe('desc');
  });

  it('previewMilestoneDelete lists every section and lesson that would move to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const section = service.createSection(milestone.id, 'Section 1', null);
    insertLesson(db, 'a1-lesson-one', section.id);

    const preview = service.previewMilestoneDelete(milestone.id);

    expect(preview.sections).toEqual([
      { id: section.id, title: 'Section 1', lessons: [{ id: 'a1-lesson-one', title: 'a1-lesson-one' }] },
    ]);
  });

  it('deleteMilestone relocates lessons across multiple sections to Unsorted, then removes it', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const s1 = service.createSection(milestone.id, 'S1', null);
    const s2 = service.createSection(milestone.id, 'S2', null);
    insertLesson(db, 'a1-l1', s1.id);
    insertLesson(db, 'a1-l2', s2.id);

    service.deleteMilestone(milestone.id);

    const placements = db
      .prepare(
        `SELECT lp.lesson_id, m.title as milestone_title FROM lesson_placements lp
         JOIN sections s ON s.id = lp.section_id
         JOIN milestones m ON m.id = s.milestone_id
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
    service.createMilestone('generic', 'A1', 'Basics', null); // forces getTrackStructure-independent creation path unnecessary; ensure Unsorted exists directly instead
    const unsortedId = 'generic-a1-unsorted';
    db.prepare(
      "INSERT INTO milestones (id, track, level, title, order_index) VALUES (?, 'generic', 'A1', 'Unsorted', 0)"
    ).run(unsortedId);
    db.prepare(
      "INSERT INTO sections (id, milestone_id, title, order_index) VALUES (?, ?, 'Unsorted', 0)"
    ).run(`${unsortedId}-section`, unsortedId);

    expect(() => service.deleteMilestone(unsortedId)).toThrow();
  });

  it('reorderMilestones rejects a payload that includes Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m1 = service.createMilestone('generic', 'A1', 'M1', null);
    expect(() => service.reorderMilestones('generic', 'A1', [m1.id, 'generic-a1-unsorted'])).toThrow();
  });

  it('reorderMilestones rejects a payload that omits an existing milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    service.createMilestone('generic', 'A1', 'M1', null);
    const m2 = service.createMilestone('generic', 'A1', 'M2', null);
    expect(() => service.reorderMilestones('generic', 'A1', [m2.id])).toThrow();
  });

  it('reorderMilestones applies the given order', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m1 = service.createMilestone('generic', 'A1', 'M1', null);
    const m2 = service.createMilestone('generic', 'A1', 'M2', null);

    service.reorderMilestones('generic', 'A1', [m2.id, m1.id]);

    const rows = db
      .prepare('SELECT id FROM milestones WHERE track = ? AND level = ? AND id != ? ORDER BY order_index')
      .all('generic', 'A1', 'generic-a1-unsorted') as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([m2.id, m1.id]);
  });
});

describe('curriculumStructureService — sections', () => {
  it('creates and renames a section', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const created = service.createSection(milestone.id, 'Section 1', null);
    expect(created.title).toBe('Section 1');

    const renamed = service.renameSection(created.id, 'Section One', 'desc');
    expect(renamed.title).toBe('Section One');
  });

  it('deleteSection relocates its lessons to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const section = service.createSection(milestone.id, 'S1', null);
    insertLesson(db, 'a1-l1', section.id);

    service.deleteSection(section.id);

    const placement = db
      .prepare(
        `SELECT m.title as milestone_title FROM lesson_placements lp
         JOIN sections s ON s.id = lp.section_id
         JOIN milestones m ON m.id = s.milestone_id
         WHERE lp.lesson_id = ?`
      )
      .get('a1-l1') as { milestone_title: string };
    expect(placement.milestone_title).toBe('Unsorted');
    expect(db.prepare('SELECT 1 FROM sections WHERE id = ?').get(section.id)).toBeUndefined();
  });

  it('reorderSections applies the given order within one milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const s1 = service.createSection(milestone.id, 'S1', null);
    const s2 = service.createSection(milestone.id, 'S2', null);

    service.reorderSections(milestone.id, [s2.id, s1.id]);

    const rows = db
      .prepare('SELECT id FROM sections WHERE milestone_id = ? ORDER BY order_index')
      .all(milestone.id) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([s2.id, s1.id]);
  });
});
