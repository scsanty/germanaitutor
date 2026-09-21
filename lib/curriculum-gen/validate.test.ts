import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { validateCurriculum } from './validate';

describe('validateCurriculum', () => {
  it('reports counts and no issues for a well-formed tree', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s2', 'm1', 'S2', 1);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('l1', 'A1', 'grammar', 'L1', 'Explanation', '[]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's2', 0);
    `);
    const report = validateCurriculum(db);
    expect(report.counts.milestones).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it('flags lessons with no content, orphan sections, and under-decomposed milestones', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, source_level, skill, title) VALUES ('l1', 'A1', 'grammar', 'L1');
    `);
    const report = validateCurriculum(db);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'Lesson l1 has no content (explanation is NULL)',
        'Section s1 has zero lessons',
        'Milestone m1 has only 1 section(s) — possibly under-decomposed',
      ])
    );
  });
});
