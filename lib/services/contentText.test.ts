import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createContentText } from './contentText';

describe('contentText', () => {
  it('resolves titles and descriptions to a language, falling back to English', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, description, difficulty_rank, title_de, description_de)
        VALUES ('m', 'generic', 'A1', 'Basics', 'The start.', 1, 'Grundlagen', 'Der Anfang.');
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES ('a', 'generic', 'A1', 'grammar', 'Hello', 'Hallo'),
        ('b', 'generic', 'A1', 'grammar', 'Bye', '');`);
    const text = createContentText(db);
    expect(text.lessonTitle('a', 'de')).toBe('Hallo');
    expect(text.lessonTitle('b', 'de')).toBe('Bye');
    expect(text.lessonTitle('a', 'en')).toBe('Hello');
    expect(text.milestoneTitle('m', 'de')).toBe('Grundlagen');
    expect(text.milestoneDescription('m', 'de')).toBe('Der Anfang.');
  });
});
