import type Database from 'better-sqlite3';
import type { Track, ExerciseType, ExerciseContent } from '../curriculum/types';
import { randomSuffix } from './randomId';

export interface ExerciseInput {
  id?: string;
  type: ExerciseType;
  content: ExerciseContent;
  track?: Track | null;
}

/**
 * Applies an Add/Edit form's full exercise list in one call: entries with an id are
 * updated in place (id preserved), entries without one are created with a freshly minted
 * id, and any existing exercise not present in `incoming` is deleted. Exercises have no
 * order, so nothing here reads or derives a position.
 */
export function reconcileExercises(db: Database.Database, lessonId: string, incoming: ExerciseInput[]): void {
  const existingIds = new Set(
    (db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all(lessonId) as { id: string }[]).map((r) => r.id)
  );
  const keepIds = new Set<string>();

  const update = db.prepare('UPDATE exercises SET type = ?, content = ?, track = ? WHERE id = ?');
  const insert = db.prepare('INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)');

  for (const ex of incoming) {
    if (ex.id) {
      if (!existingIds.has(ex.id)) throw new Error(`Exercise not found on lesson ${lessonId}: ${ex.id}`);
      update.run(ex.type, JSON.stringify(ex.content), ex.track ?? null, ex.id);
      keepIds.add(ex.id);
    } else {
      const id = `${lessonId}__ex-${randomSuffix()}`;
      insert.run(id, lessonId, ex.track ?? null, ex.type, JSON.stringify(ex.content));
      keepIds.add(id);
    }
  }

  const drop = db.prepare('DELETE FROM exercises WHERE id = ?');
  for (const id of existingIds) {
    if (!keepIds.has(id)) drop.run(id);
  }
}
