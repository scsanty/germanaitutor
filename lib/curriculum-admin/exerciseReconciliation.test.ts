import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { reconcileExercises } from './exerciseReconciliation';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
}

describe('reconcileExercises', () => {
  it('creates new exercises with minted, non-positional ids', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [
      { type: 'flashcard', content: { front: 'Hund', back: 'dog' } },
      { type: 'flashcard', content: { front: 'Katze', back: 'cat' } },
    ]);
    const rows = db.prepare('SELECT id, content FROM exercises WHERE lesson_id = ?').all('l1') as {
      id: string;
      content: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows.every((r) => r.id.startsWith('l1__ex-'))).toBe(true);
  });

  it('updates an existing exercise in place, keeping its id', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [{ type: 'flashcard', content: { front: 'Hund', back: 'dog' } }]);
    const [existing] = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];

    reconcileExercises(db, 'l1', [{ id: existing.id, type: 'flashcard', content: { front: 'Hund', back: 'DOG' } }]);

    const rows = db.prepare('SELECT id, content FROM exercises WHERE lesson_id = ?').all('l1') as {
      id: string;
      content: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existing.id);
    expect(JSON.parse(rows[0].content)).toEqual({ front: 'Hund', back: 'DOG' });
  });

  it('deletes an exercise omitted from the incoming list, leaving others untouched', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [
      { type: 'flashcard', content: { front: 'Hund', back: 'dog' } },
      { type: 'flashcard', content: { front: 'Katze', back: 'cat' } },
    ]);
    const [keep, drop] = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];

    reconcileExercises(db, 'l1', [{ id: keep.id, type: 'flashcard', content: { front: 'Hund', back: 'dog' } }]);

    const rows = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];
    expect(rows).toEqual([{ id: keep.id }]);
    const dropped = db.prepare('SELECT id FROM exercises WHERE id = ?').get(drop.id);
    expect(dropped).toBeUndefined();
  });

  it('adds a new exercise alongside an unrelated update in the same call', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [{ type: 'flashcard', content: { front: 'Hund', back: 'dog' } }]);
    const [existing] = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];

    reconcileExercises(db, 'l1', [
      { id: existing.id, type: 'flashcard', content: { front: 'Hund', back: 'dog' } },
      { type: 'flashcard', content: { front: 'Maus', back: 'mouse' } },
    ]);

    const rows = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];
    expect(rows).toHaveLength(2);
  });

  it('throws when an incoming id does not belong to this lesson', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    expect(() =>
      reconcileExercises(db, 'l1', [{ id: 'nope', type: 'flashcard', content: { front: 'a', back: 'b' } }])
    ).toThrow();
  });
});
