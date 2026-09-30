import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from './unsortedBucket';
import { assertPrerequisiteScope, scopeViolationMessages } from './prerequisiteScope';

function setup() {
  const db = createDbClient(':memory:');
  db.exec(`
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES
      ('m1', 'generic', 'A1', 'One', 1), ('m2a', 'generic', 'A1', 'Two A', 2), ('m2b', 'generic', 'A1', 'Two B', 2),
      ('x1', 'generic', 'A2', 'Other level', 1);
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES
      ('a', 'generic', 'A1', 'grammar', 'Alpha'), ('b', 'generic', 'A1', 'grammar', 'Beta'),
      ('c', 'generic', 'A1', 'grammar', 'Gamma'), ('d', 'generic', 'A1', 'grammar', 'Delta'),
      ('x', 'generic', 'A2', 'grammar', 'Other'), ('u', 'generic', 'A1', 'grammar', 'Shelved');
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a', 'm1'), ('b', 'm1'), ('c', 'm2a'), ('d', 'm2b'), ('x', 'x1');
  `);
  const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
  db.prepare("INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('u', ?)").run(milestoneId);
  return db;
}

function edge(db: ReturnType<typeof setup>, lesson: string, prerequisite: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(lesson, prerequisite);
}

describe('prerequisite scope', () => {
  it('accepts the same milestone, a lower rank, and edges touching Unsorted', () => {
    const db = setup();
    edge(db, 'b', 'a');
    edge(db, 'c', 'a');
    edge(db, 'a', 'u');
    expect(scopeViolationMessages(db, ['a', 'b', 'c'])).toEqual([]);
    expect(() => assertPrerequisiteScope(db, ['a', 'b', 'c'])).not.toThrow();
  });

  it('names a later or parallel milestone and another track or level', () => {
    const db = setup();
    edge(db, 'a', 'c');
    edge(db, 'c', 'd');
    edge(db, 'a', 'x');
    expect(scopeViolationMessages(db, ['a', 'c'])).toEqual([
      'Alpha builds on Gamma, which is in a later or parallel milestone',
      'Alpha builds on Other, which is in another track or level',
      'Gamma builds on Delta, which is in a later or parallel milestone',
    ]);
  });

  it('checks edges where the given lesson is the prerequisite too', () => {
    const db = setup();
    edge(db, 'a', 'c');
    expect(scopeViolationMessages(db, ['c'])).toEqual(['Alpha builds on Gamma, which is in a later or parallel milestone']);
  });
});
