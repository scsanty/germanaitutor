import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Skill } from '../curriculum/types';

export interface FlashcardViolation {
  lessonId: string;
  title: string;
  track: Track;
  level: CefrLevel;
  skill: Skill;
  flashcardCount: number;
}

export function createCurriculumAuditService(db: Database.Database) {
  function listFlashcardViolations(): FlashcardViolation[] {
    const rows = db
      .prepare(
        `SELECT l.id, l.title, l.track, l.source_level, l.skill, COUNT(e.id) AS flashcard_count
         FROM lessons l JOIN exercises e ON e.lesson_id = l.id
         WHERE e.type = 'flashcard' AND l.skill != 'vocabulary'
         GROUP BY l.id
         ORDER BY l.track, l.source_level, l.id`
      )
      .all() as { id: string; title: string; track: Track; source_level: CefrLevel; skill: Skill; flashcard_count: number }[];
    return rows.map((r) => ({
      lessonId: r.id,
      title: r.title,
      track: r.track,
      level: r.source_level,
      skill: r.skill,
      flashcardCount: r.flashcard_count,
    }));
  }

  return { listFlashcardViolations };
}
