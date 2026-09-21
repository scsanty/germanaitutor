import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runPhase3 } from './phase3Content';

describe('runPhase3', () => {
  it('fills in explanation, examples, and exercises for a pending lesson', async () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO lessons (id, source_level, skill, title) VALUES ('a1-test', 'A1', 'grammar', 'Test lesson')`);
    const generateJSON = vi.fn().mockResolvedValue({
      explanation: 'Explanation text',
      examples: ['Beispiel 1'],
      exercises: [{ slug: 'mc-1', type: 'multiple_choice', content: { question: 'q', options: ['a', 'b'], correctIndex: 0 } }],
    });
    await runPhase3(db, { generateJSON });

    const lesson = db.prepare('SELECT explanation, examples FROM lessons WHERE id = ?').get('a1-test') as any;
    expect(lesson.explanation).toBe('Explanation text');
    expect(JSON.parse(lesson.examples)).toEqual(['Beispiel 1']);
    const exercises = db.prepare('SELECT * FROM exercises WHERE lesson_id = ?').all('a1-test');
    expect(exercises).toHaveLength(1);
  });

  it('is resumable: skips lessons that already have explanation', async () => {
    const db = createDbClient(':memory:');
    db.exec(
      `INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('a1-done', 'A1', 'grammar', 'Done', 'Already written', '[]')`
    );
    const generateJSON = vi.fn();
    await runPhase3(db, { generateJSON });
    expect(generateJSON).not.toHaveBeenCalled();
  });

  it('fills in pending track override rows', async () => {
    const db = createDbClient(':memory:');
    db.exec(
      `INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('a1-test', 'A1', 'grammar', 'Test', 'Canonical', '["x"]')`
    );
    db.exec(`INSERT INTO lesson_track_overrides (lesson_id, track) VALUES ('a1-test', 'telc')`);
    const generateJSON = vi.fn().mockResolvedValue({
      explanation: 'TELC-specific explanation',
      examples: ['TELC example'],
      exercises: [],
    });
    await runPhase3(db, { generateJSON });

    const override = db
      .prepare('SELECT explanation FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
      .get('a1-test', 'telc') as any;
    expect(override.explanation).toBe('TELC-specific explanation');
  });
});
