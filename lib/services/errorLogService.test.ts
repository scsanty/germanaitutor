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
    expect(rows[0].wrong.length).toBeLessThanOrEqual(80);
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

  it('matches whole words and phrases, so decoy titles do not match', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, title_de, difficulty_rank) VALUES ('m1', 'generic', 'B1', 'M', 'M', 1), ('m2', 'generic', 'B1', 'N', 'N', 2);
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES
        ('rel', 'generic', 'B1', 'grammar', 'Relative Clauses with Prepositions (alles, etwas, nichts)', 'Relativsätze mit was (alles, etwas, nichts)'),
        ('part', 'generic', 'B1', 'grammar', 'Modal Particles and Nuance', 'Modalpartikeln'),
        ('pass', 'generic', 'B1', 'grammar', 'Passive Substitutes', 'Passiversatzformen'),
        ('rep', 'generic', 'B1', 'grammar', 'The Präteritum in Reports and Letters', 'Das Präteritum in Berichten und Briefen'),
        ('gen', 'generic', 'B1', 'grammar', 'Formal Genitive Prepositions', 'Gehobene Genitivpräpositionen'),
        ('adj', 'generic', 'B1', 'grammar', 'Adjective Declension after Definite Articles', 'Adjektivendungen nach dem bestimmten Artikel'),
        ('art', 'generic', 'B1', 'grammar', 'Definite and Indefinite Articles', 'Bestimmte und unbestimmte Artikel'),
        ('neg', 'generic', 'B1', 'grammar', 'Negation with Nicht and Kein', 'Verneinung'),
        ('mod', 'generic', 'B1', 'grammar', 'Modal Verbs: Können', 'Modalverben: können');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('rel', 'm1'), ('part', 'm1'), ('pass', 'm1'), ('rep', 'm1'), ('gen', 'm1'),
        ('adj', 'm1'), ('art', 'm2'), ('neg', 'm2'), ('mod', 'm2');`);
    const log = createErrorLogService(db);
    const id = (c: string) => log.lessonFor(c, 'generic', 'B1')?.id ?? null;
    expect(id('negation')).toBe('neg'); // not "nichts" in the relative-clause lesson
    expect(id('modal_verbs')).toBe('mod'); // not "Modal Particles"
    expect(id('articles_gender')).toBe('art'); // not "Definite Articles" in adjective declension
    expect(id('passive')).toBeNull(); // not "Passiversatzformen"
    expect(id('letter_conventions')).toBeNull(); // not "Berichten und Briefen"
    expect(id('register')).toBeNull(); // not "Formal Genitive Prepositions"
    expect(id('verbs_prepositions')).toBeNull(); // not a relative clause "with Prepositions"
  });

  it('prefers the lesson matching more keywords, then the lower-ranked milestone', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, title_de, difficulty_rank) VALUES ('m1', 'generic', 'B1', 'M', 'M', 1), ('m2', 'generic', 'B1', 'N', 'N', 2);
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES
        ('one', 'generic', 'B1', 'grammar', 'Comparative', 'x'),
        ('two', 'generic', 'B1', 'grammar', 'Comparative and Superlative', 'y'),
        ('early', 'generic', 'B1', 'grammar', 'Superlative and Comparative', 'z');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('one', 'm1'), ('two', 'm2'), ('early', 'm1');`);
    expect(createErrorLogService(db).lessonFor('comparison', 'generic', 'B1')?.id).toBe('early');
  });
});
