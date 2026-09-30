import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';

describe('bilingual columns', () => {
  it('adds German columns with empty defaults', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m', 'generic', 'A1', 'Basics', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l', 'generic', 'A1', 'grammar', 'Hello');`);
    expect(db.prepare('SELECT title_de, description_de FROM milestones').get()).toEqual({ title_de: '', description_de: null });
    expect(db.prepare('SELECT title_de, explanation_de, examples_de FROM lessons').get()).toEqual({
      title_de: '',
      explanation_de: null,
      examples_de: null,
    });
  });
});
