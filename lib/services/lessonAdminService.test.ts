import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createLessonAdminService, flashcardRuleViolation, type UpdateLessonInput } from './lessonAdminService';
import type { ExerciseInput } from '../curriculum-admin/exerciseReconciliation';

function seedMilestone(db: ReturnType<typeof createDbClient>) {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'M1', 1);
  `);
}

describe('lessonAdminService.createLesson', () => {
  it('creates a lesson with the {level}-{slug} id and returns it', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
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
      placement: { milestoneId: 'm1' },
    });

    expect(lesson.id).toBe('a1-modal-verbs');
    expect(lesson.title).toBe('Modal Verbs');
  });

  it('rejects a duplicate id, checked globally across tracks', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m2', 'telc', 'A1', 'M2', 1);
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
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();
  });

  it('creates prerequisite edges', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
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
      placement: { milestoneId: 'm1' },
    });

    const edge = db
      .prepare('SELECT * FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?')
      .get('a1-modal-verbs', 'a1-basics');
    expect(edge).toBeDefined();
  });

  it('creates exercises via reconciliation, minting fresh ids', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);

    service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'vocabulary',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [{ type: 'flashcard', content: { front: 'können', back: 'can' } }],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
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
      placement: { newMilestoneTitle: 'New Milestone', newMilestoneRank: 2 },
    });

    const placement = db.prepare('SELECT milestone_id FROM lesson_placements WHERE lesson_id = ?').get(lesson.id) as {
      milestone_id: string;
    };
    expect(db.prepare('SELECT title, difficulty_rank FROM milestones WHERE id = ?').get(placement.milestone_id)).toEqual({
      title: 'New Milestone',
      difficulty_rank: 2,
    });
  });

  it('rolls back the whole insert if a prerequisite id would create a cycle', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
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
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();

    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-self-ref');
    expect(lesson).toBeUndefined();
  });

  it('rolls back an inline-created milestone too, on a failure later in the same create', () => {
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
        placement: { newMilestoneTitle: 'New Milestone', newMilestoneRank: 2 },
      })
    ).toThrow();

    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-self-ref')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM milestones WHERE title = ?').get('New Milestone')).toBeUndefined();
  });
});

describe('lessonAdminService.updateLesson', () => {
  it('updates freely-editable fields without touching track/level', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });

    const updated = service.updateLesson(created.id, {
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs (Updated)',
      explanation: 'Now with an explanation',
      examples: ['Ich kann.'],
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });

    expect(updated.title).toBe('Modal Verbs (Updated)');
    expect(updated.explanation).toBe('Now with an explanation');
  });

  it('throws when updating a lesson that does not exist', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    expect(() =>
      service.updateLesson('a1-nope', {
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'X',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();
  });

  it('rejects a track change while the lesson has a prerequisite edge as dependent', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-basics', 'generic', 'A1', 'grammar', 'Basics')`
    ).run();
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-basics'],
      placement: { milestoneId: 'm1' },
    });

    expect(() =>
      service.updateLesson(created.id, {
        track: 'telc',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: created.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-basics'],
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();
  });

  it('rejects a level change while another lesson depends on it', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'basics',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Basics',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-advanced', 'generic', 'A1', 'grammar', 'Advanced')`
    ).run();
    db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
      'a1-advanced',
      created.id
    );

    expect(() =>
      service.updateLesson(created.id, {
        track: 'generic',
        sourceLevel: 'A2',
        skill: 'grammar',
        title: created.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();
  });

  it('rejects a track change while the lesson has a concept link', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-modal-verbs-telc', 'telc', 'A1', 'grammar', 'x')`
    ).run();
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(
      ...[created.id, 'a1-modal-verbs-telc'].sort()
    );

    expect(() =>
      service.updateLesson(created.id, {
        track: 'goethe',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: created.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();
  });

  it('allows a track change with no blocking edges, placing it into the new track+level structure', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m2', 'telc', 'A1', 'M2', 1);
    `);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });

    const updated = service.updateLesson(created.id, {
      track: 'telc',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: created.title,
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm2' },
    });

    expect(updated.track).toBe('telc');
    const placement = db.prepare('SELECT milestone_id FROM lesson_placements WHERE lesson_id = ?').get(created.id) as {
      milestone_id: string;
    };
    expect(placement.milestone_id).toBe('m2');
  });

  it('reconciles prerequisites — adds newly-selected ones and removes deselected ones', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-basics', 'generic', 'A1', 'grammar', 'Basics')`
    ).run();
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-extra', 'generic', 'A1', 'grammar', 'Extra')`
    ).run();
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-basics'],
      placement: { milestoneId: 'm1' },
    });

    service.updateLesson(created.id, {
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: created.title,
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-extra'],
      placement: { milestoneId: 'm1' },
    });

    const rows = db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(
      created.id
    ) as { prerequisite_lesson_id: string }[];
    expect(rows).toEqual([{ prerequisite_lesson_id: 'a1-extra' }]);
  });

  it('rejects a new prerequisite that would create a cycle', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    const a = service.createLesson({
      slug: 'a',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'A',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });
    const b = service.createLesson({
      slug: 'b',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'B',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [a.id],
      placement: { milestoneId: 'm1' },
    });

    expect(() =>
      service.updateLesson(a.id, {
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: a.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [b.id],
        placement: { milestoneId: 'm1' },
      })
    ).toThrow();
  });

  it('rolls back an inline-created milestone too, on a cycle failure later in the same update', () => {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    const service = createLessonAdminService(db);
    const a = service.createLesson({
      slug: 'a',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'A',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    });
    const b = service.createLesson({
      slug: 'b',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'B',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [a.id],
      placement: { milestoneId: 'm1' },
    });

    expect(() =>
      service.updateLesson(a.id, {
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: a.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [b.id],
        placement: { newMilestoneTitle: 'New Milestone', newMilestoneRank: 2 },
      })
    ).toThrow();

    expect(db.prepare('SELECT 1 FROM milestones WHERE title = ?').get('New Milestone')).toBeUndefined();
    // a's placement is unchanged — still in the original milestone, not the (rolled-back) new one
    const placement = db.prepare('SELECT milestone_id FROM lesson_placements WHERE lesson_id = ?').get(a.id) as {
      milestone_id: string;
    };
    expect(placement.milestone_id).toBe('m1');
  });
});

describe('flashcard rule', () => {
  function setupRule() {
    const db = createDbClient(':memory:');
    seedMilestone(db);
    return { db, service: createLessonAdminService(db) };
  }

  const flashcard: ExerciseInput = { type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
  const multipleChoice: ExerciseInput = {
    type: 'multiple_choice',
    content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 },
  };

  function lessonFields(skill: 'grammar' | 'vocabulary', exercises: ExerciseInput[]): UpdateLessonInput {
    return {
      track: 'generic',
      sourceLevel: 'A1',
      skill,
      title: 'Rule test',
      explanation: null,
      examples: null,
      exercises,
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    };
  }

  it('describes a violation with the exact message', () => {
    expect(flashcardRuleViolation('grammar', [flashcard, flashcard, multipleChoice])).toBe(
      'This lesson has 2 flashcards, which are only allowed in vocabulary lessons. Remove or change them first.'
    );
    expect(flashcardRuleViolation('grammar', [flashcard])).toBe(
      'This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.'
    );
    expect(flashcardRuleViolation('vocabulary', [flashcard])).toBeNull();
    expect(flashcardRuleViolation('grammar', [multipleChoice])).toBeNull();
  });

  it('allows flashcards in a vocabulary lesson', () => {
    const { service } = setupRule();
    expect(service.createLesson({ slug: 'rule-test', ...lessonFields('vocabulary', [flashcard]) }).id).toBe('a1-rule-test');
  });

  it('refuses to create a non-vocabulary lesson with a flashcard', () => {
    const { db, service } = setupRule();
    expect(() =>
      service.createLesson({ slug: 'rule-test', ...lessonFields('grammar', [flashcard, multipleChoice]) })
    ).toThrow('This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.');
    expect(db.prepare('SELECT COUNT(*) AS n FROM lessons').get()).toEqual({ n: 0 });
  });

  it('refuses to change a vocabulary lesson with flashcards to another skill', () => {
    const { db, service } = setupRule();
    service.createLesson({ slug: 'rule-test', ...lessonFields('vocabulary', [flashcard]) });
    expect(() => service.updateLesson('a1-rule-test', lessonFields('grammar', [flashcard]))).toThrow(
      'This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.'
    );
    expect(db.prepare('SELECT skill FROM lessons WHERE id = ?').get('a1-rule-test')).toEqual({ skill: 'vocabulary' });
  });
});
