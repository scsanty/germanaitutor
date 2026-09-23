import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createLessonAdminService } from './lessonAdminService';

function seedMilestoneAndSection(db: ReturnType<typeof createDbClient>) {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
  `);
}

describe('lessonAdminService.createLesson', () => {
  it('creates a lesson with the {level}-{slug} id and returns it', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);

    const lesson = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: 'Explanation text',
      examples: ['Ich kann schwimmen.'],
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    expect(lesson.id).toBe('a1-modal-verbs');
    expect(lesson.title).toBe('Modal Verbs');
  });

  it('rejects a duplicate id, checked globally across tracks', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m2', 'telc', 'A1', 'M2', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s2', 'm2', 'S2', 0);
    `);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-modal-verbs', 'telc', 'A1', 'grammar', 'x')`
    ).run();
    const service = createLessonAdminService(db);

    expect(() =>
      service.createLesson({
        slug: 'modal-verbs',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Modal Verbs',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('creates prerequisite edges', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-basics', 'generic', 'A1', 'grammar', 'Basics')`
    ).run();
    const service = createLessonAdminService(db);

    service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-basics'],
      placement: { sectionId: 's1' },
    });

    const edge = db
      .prepare('SELECT * FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?')
      .get('a1-modal-verbs', 'a1-basics');
    expect(edge).toBeDefined();
  });

  it('creates exercises via reconciliation, minting fresh ids', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);

    service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [{ type: 'flashcard', content: { front: 'können', back: 'can' } }],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    const rows = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('a1-modal-verbs') as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id.startsWith('a1-modal-verbs__ex-')).toBe(true);
  });

  it('places the lesson via the placement resolver, including inline creation', () => {
    const db = createDbClient(':memory:');
    const service = createLessonAdminService(db);

    const lesson = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { newMilestoneTitle: 'New Milestone', newSectionTitle: 'New Section' },
    });

    const placement = db.prepare('SELECT section_id FROM lesson_placements WHERE lesson_id = ?').get(lesson.id) as {
      section_id: string;
    };
    const section = db.prepare('SELECT title FROM sections WHERE id = ?').get(placement.section_id) as {
      title: string;
    };
    expect(section.title).toBe('New Section');
  });

  it('rolls back the whole insert if a prerequisite id would create a cycle', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);

    // A lesson listing itself as its own prerequisite is the simplest way to trigger the
    // cycle guard deterministically (wouldCreateCycle treats self-reference as a cycle).
    expect(() =>
      service.createLesson({
        slug: 'self-ref',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Self Ref',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-self-ref'],
        placement: { sectionId: 's1' },
      })
    ).toThrow();

    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-self-ref');
    expect(lesson).toBeUndefined();
  });

  it('rolls back an inline-created milestone and section too, on a failure later in the same create', () => {
    const db = createDbClient(':memory:');
    const service = createLessonAdminService(db);

    expect(() =>
      service.createLesson({
        slug: 'self-ref',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Self Ref',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-self-ref'],
        placement: { newMilestoneTitle: 'New Milestone', newSectionTitle: 'New Section' },
      })
    ).toThrow();

    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-self-ref')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM milestones WHERE title = ?').get('New Milestone')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM sections WHERE title = ?').get('New Section')).toBeUndefined();
  });
});
