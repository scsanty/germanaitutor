import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createErrorLogService } from './errorLogService';

describe('errorLogService', () => {
  it('records trimmed entries, normalizing categories, and ranks the last 30 days', () => {
    const db = createDbClient(':memory:');
    let now = new Date('2026-08-01T10:00:00Z');
    const log = createErrorLogService(db, { now: () => now });
    log.record('lesson', [{ category: 'perfect_auxiliary', wrong: 'habe gegangen', right: 'bin gegangen' }]);
    now = new Date('2026-09-29T10:00:00Z');
    log.record('teil', [
      { category: 'adjective_endings', wrong: 'ein gute Idee', right: 'eine gute Idee' },
      { category: 'adjective_endings', wrong: 'mit gute Freunden', right: 'mit guten Freunden' },
      { category: 'nonsense', wrong: 'x', right: 'y' },
    ]);
    expect(log.topMistakes().map((m) => [m.category.id, m.count])).toEqual([
      ['adjective_endings', 2],
      ['other', 1],
    ]);
    expect(log.topMistakes()[0].example).toEqual({ wrong: 'mit gute Freunden', right: 'mit guten Freunden' });
  });

  it('skips empty wrong texts and trims long snippets', () => {
    const db = createDbClient(':memory:');
    const log = createErrorLogService(db);
    log.record('lesson', [
      { category: 'genitive', wrong: '  ', right: 'des Mannes' },
      { category: 'genitive', wrong: 'wort '.repeat(40), right: 'ok' },
    ]);
    const rows = db.prepare('SELECT wrong FROM error_log').all() as { wrong: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].wrong.length).toBeLessThanOrEqual(81);
  });

  it('finds a grammar lesson for a category by keyword in the active track and level', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, title_de, difficulty_rank) VALUES ('m', 'telc', 'B1', 'M', 'M', 1);
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES
        ('b1-adj', 'telc', 'B1', 'grammar', 'Adjective endings after articles', 'Adjektivdeklination'),
        ('b1-voc', 'telc', 'B1', 'vocabulary', 'Adjectives for feelings', 'Adjektive');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('b1-adj', 'm'), ('b1-voc', 'm');`);
    const log = createErrorLogService(db);
    expect(log.lessonFor('adjective_endings', 'telc', 'B1')).toEqual({ id: 'b1-adj', title: 'Adjective endings after articles' });
    expect(log.lessonFor('genitive', 'telc', 'B1')).toBeNull();
    expect(log.lessonFor('adjective_endings', 'telc', 'A1')).toBeNull();
  });
});
