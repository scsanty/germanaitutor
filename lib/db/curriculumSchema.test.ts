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
        .prepare(`INSERT INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)`)
        .run('a1-present-tense-regular', 'A1', 'grammar', 'Present tense of regular verbs')
    ).not.toThrow();
    db.close();
  });
});
