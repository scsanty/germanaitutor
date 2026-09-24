import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumAuditService } from './curriculumAuditService';

function seed() {
  const db = createDbClient(':memory:');
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES
      ('a1-vocab', 'generic', 'A1', 'vocabulary', 'Vocab'),
      ('a1-grammar', 'generic', 'A1', 'grammar', 'Grammar'),
      ('a2-speaking', 'goethe', 'A2', 'speaking', 'Speaking'),
      ('a1-clean', 'telc', 'A1', 'reading', 'Clean');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('e1', 'a1-vocab', 'flashcard', '{}'),
      ('e2', 'a1-grammar', 'flashcard', '{}'),
      ('e3', 'a1-grammar', 'flashcard', '{}'),
      ('e4', 'a1-grammar', 'multiple_choice', '{}'),
      ('e5', 'a2-speaking', 'flashcard', '{}'),
      ('e6', 'a1-clean', 'free_text', '{}');
  `);
  return db;
}

describe('curriculumAuditService', () => {
  it('lists every non-vocabulary lesson that has flashcards, with a count', () => {
    expect(createCurriculumAuditService(seed()).listFlashcardViolations()).toEqual([
      { lessonId: 'a1-grammar', title: 'Grammar', track: 'generic', level: 'A1', skill: 'grammar', flashcardCount: 2 },
      { lessonId: 'a2-speaking', title: 'Speaking', track: 'goethe', level: 'A2', skill: 'speaking', flashcardCount: 1 },
    ]);
  });

  it('is empty when every flashcard is in a vocabulary lesson', () => {
    const db = seed();
    db.exec("DELETE FROM exercises WHERE id IN ('e2', 'e3', 'e5')");
    expect(createCurriculumAuditService(db).listFlashcardViolations()).toEqual([]);
  });
});
