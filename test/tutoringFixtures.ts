import type Database from 'better-sqlite3';
import type { GradeResult } from '@/lib/tutoring/grading';

/**
 * Generic A1 has two visible lessons (a1-greet, then a1-sein, which builds on a1-greet).
 * Goethe A1 has one lesson, concept-linked to a1-greet. Generic A2 has one lesson.
 * Exercises are inserted in authored order; their ids are deliberately not in that order
 * alphabetically for a1-sein (…__ex10 before …__ex2).
 */
export function seedTutoringCurriculum(db: Database.Database): void {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES
      ('g-a1-m1', 'generic', 'A1', 'Basics', 1),
      ('o-a1-m1', 'goethe', 'A1', 'Goethe basics', 1),
      ('g-a2-m1', 'generic', 'A2', 'Next steps', 1);
    INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES
      ('a1-greet', 'generic', 'A1', 'vocabulary', 'Saying hello', 'Say Hallo to greet someone.', '["Hallo!","Guten Tag!"]'),
      ('a1-sein', 'generic', 'A1', 'grammar', 'The verb sein', 'ich bin, du bist', NULL),
      ('a1-goethe-greet', 'goethe', 'A1', 'vocabulary', 'Goethe greetings', NULL, NULL),
      ('a2-past', 'generic', 'A2', 'grammar', 'The past of sein', NULL, NULL);
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES
      ('a1-greet', 'g-a1-m1'),
      ('a1-sein', 'g-a1-m1'),
      ('a1-goethe-greet', 'o-a1-m1'),
      ('a2-past', 'g-a2-m1');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-greet__ex1', 'a1-greet', 'multiple_choice', '{"question":"How do you greet someone?","options":["Hallo","Tschüss"],"correctIndex":0}'),
      ('a1-greet__ex2', 'a1-greet', 'flashcard', '{"front":"der Hund","back":"the dog"}'),
      ('a1-sein__ex2', 'a1-sein', 'fill_blank', '{"textWithBlank":"Ich ___ müde.","correctAnswer":"bin"}'),
      ('a1-sein__ex10', 'a1-sein', 'free_text', '{"prompt":"Say that you are tired.","modelAnswer":"Ich bin müde."}'),
      ('a1-goethe-greet__ex1', 'a1-goethe-greet', 'multiple_choice', '{"question":"Hi?","options":["Hallo","Nein"],"correctIndex":0}'),
      ('a2-past__ex1', 'a2-past', 'fill_blank', '{"textWithBlank":"Ich ___ müde.","correctAnswer":"war"}');
    INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('a1-sein', 'a1-greet');
    INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES ('a1-goethe-greet', 'a1-greet');
  `);
}

export function addAttempt(
  db: Database.Database,
  exerciseId: string,
  result: GradeResult,
  options: { source?: 'lesson' | 'queue'; on?: string } = {}
): void {
  const { lesson_id: lessonId } = db.prepare('SELECT lesson_id FROM exercises WHERE id = ?').get(exerciseId) as {
    lesson_id: string;
  };
  const on = options.on ?? '2026-09-24';
  db.prepare(
    `INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answer_text, answered_at, answered_on)
     VALUES (?, ?, ?, ?, 'x', ?, ?)`
  ).run(exerciseId, lessonId, options.source ?? 'lesson', result, `${on}T10:00:00.000Z`, on);
}

export function markComplete(db: Database.Database, lessonId: string): void {
  db.prepare("INSERT INTO lesson_completions (lesson_id, completed_at) VALUES (?, '2026-09-24T10:00:00.000Z')").run(
    lessonId
  );
}

export function scheduleReview(db: Database.Database, exerciseId: string, nextDueAt: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
     VALUES (?, 1, 2.5, 3, ?, '2026-09-24T10:00:00.000Z')`
  ).run(exerciseId, nextDueAt);
}

export function addPracticeExercise(
  db: Database.Database,
  id: string,
  lessonId: string,
  options: { type?: string; content?: unknown; status?: 'unreviewed' | 'approved' | 'rejected'; createdAt?: string } = {}
): void {
  db.prepare(
    `INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    lessonId,
    options.type ?? 'multiple_choice',
    JSON.stringify(options.content ?? { question: `Question ${id}?`, options: ['ja', 'nein'], correctIndex: 0 }),
    options.status ?? 'unreviewed',
    options.createdAt ?? '2026-09-29T10:00:00.000Z'
  );
}

/** Generic A1 gains a rank-2 milestone with one lesson (two exercises), locked until "Basics" is complete. */
export function addSecondMilestone(db: Database.Database): void {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('g-a1-m2', 'generic', 'A1', 'Later', 2);
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-late', 'generic', 'A1', 'grammar', 'A later lesson');
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-late', 'g-a1-m2');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-late__ex1', 'a1-late', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}'),
      ('a1-late__ex2', 'a1-late', 'fill_blank', '{"textWithBlank":"Ich ___ hier.","correctAnswer":"bin"}');
  `);
}
