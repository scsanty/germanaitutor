import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded, type SeedFile } from './curriculumSeedLoader';

function seed(practice?: SeedFile['practice']): SeedFile {
  return {
    seedVersion: '7',
    track: 'generic',
    level: 'A1',
    milestones: [
      {
        milestone: { id: 'g-m', track: 'generic', level: 'A1', title: 'M', description: null, orderIndex: 0 },
        sections: [{ section: { id: 'g-s', milestoneId: 'g-m', title: 'S', description: null, orderIndex: 0 }, lessonRefs: [{ lessonId: 'a1-l', orderIndex: 0 }] }],
      },
    ],
    lessons: [{ id: 'a1-l', track: 'generic', sourceLevel: 'A1', skill: 'grammar', title: 'L', explanation: null, examples: null }],
    exercises: [],
    prerequisites: [],
    ...(practice ? { practice } : {}),
  };
}

function load(file: SeedFile) {
  const dir = mkdtempSync(join(tmpdir(), 'gait-practice-seed-'));
  writeFileSync(join(dir, 'generic-a1.json'), JSON.stringify(file));
  const db = createDbClient(':memory:');
  loadSeedIfNeeded(db, dir);
  return db;
}

describe('seed loader: practice', () => {
  it('loads listed practice exercises as approved, skipping any whose lesson is missing', () => {
    const db = load(
      seed([
        { id: 'a1-l__px-1', lessonId: 'a1-l', type: 'fill_blank', content: { textWithBlank: '___', correctAnswer: 'ja' } },
        { id: 'a1-x__px-1', lessonId: 'a1-x', type: 'fill_blank', content: { textWithBlank: '___', correctAnswer: 'ja' } },
      ])
    );
    expect(db.prepare('SELECT id, review_status FROM practice_exercises').all()).toEqual([{ id: 'a1-l__px-1', review_status: 'approved' }]);
  });

  it('stamps seeded practice rows in ISO format like runtime rows', () => {
    const db = load(seed([{ id: 'a1-l__px-1', lessonId: 'a1-l', type: 'fill_blank', content: { textWithBlank: '___', correctAnswer: 'ja' } }]));
    const row = db.prepare('SELECT created_at, reviewed_at FROM practice_exercises').get() as { created_at: string; reviewed_at: string };
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.reviewed_at).toBe(row.created_at);
  });

  it('loads a file without a practice list as before', () => {
    expect(load(seed()).prepare('SELECT COUNT(*) AS n FROM practice_exercises').get()).toEqual({ n: 0 });
  });
});
