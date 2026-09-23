import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';

describe('curriculum schema', () => {
  it('creates all nine new tables', () => {
    const db = createDbClient(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'admin_auth',
        'milestones',
        'sections',
        'lessons',
        'lesson_placements',
        'lesson_track_overrides',
        'exercises',
        'lesson_prerequisites',
        'curriculum_meta',
      ])
    );
    db.close();
  });

  it('allows a lesson to be inserted without explanation/examples (Phase 1 state)', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      db
        .prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, ?, ?)`)
        .run('a1-present-tense-regular', 'generic', 'A1', 'grammar', 'Present tense of regular verbs')
    ).not.toThrow();
    db.close();
  });

  it('requires a track on every lesson', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      db
        .prepare(`INSERT INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)`)
        .run('a1-present-tense-regular', 'A1', 'grammar', 'Present tense of regular verbs')
    ).toThrow();
    db.close();
  });

  it('allows lessons in different tracks to share a concept_id', () => {
    const db = createDbClient(':memory:');
    const insert = db.prepare(
      `INSERT INTO lessons (id, track, concept_id, source_level, skill, title) VALUES (?, ?, ?, ?, ?, ?)`
    );
    insert.run('a1-personal-pronouns', 'generic', 'a1-pronouns-present-tense', 'A1', 'grammar', 'Personal pronouns');
    insert.run(
      'a1-goethe-personal-pronouns-verbs',
      'goethe',
      'a1-pronouns-present-tense',
      'A1',
      'grammar',
      'Personal pronouns and present tense'
    );
    const rows = db
      .prepare('SELECT id FROM lessons WHERE concept_id = ? ORDER BY id')
      .all('a1-pronouns-present-tense') as { id: string }[];
    expect(rows).toHaveLength(2);
    db.close();
  });

  it('defaults concept_id to null for a lesson with no cross-track equivalent', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, ?, ?)`).run(
      'a1-negation-nicht-kein',
      'generic',
      'A1',
      'grammar',
      'Negation with nicht and kein'
    );
    const row = db.prepare('SELECT concept_id FROM lessons WHERE id = ?').get('a1-negation-nicht-kein') as {
      concept_id: string | null;
    };
    expect(row.concept_id).toBeNull();
    db.close();
  });
});
