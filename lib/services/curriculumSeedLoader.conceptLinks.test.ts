import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded, type SeedFile } from './curriculumSeedLoader';

function seedFile(
  track: 'generic' | 'goethe',
  lessonIds: string[],
  conceptLinks?: SeedFile['conceptLinks']
): SeedFile {
  const milestoneId = `${track}-a1-m`;
  const sectionId = `${track}-a1-s`;
  return {
    seedVersion: '9',
    track,
    level: 'A1',
    milestones: [
      {
        milestone: { id: milestoneId, track, level: 'A1', title: 'M', description: null, orderIndex: 0 },
        sections: [
          {
            section: { id: sectionId, milestoneId, title: 'S', description: null, orderIndex: 0 },
            lessonRefs: lessonIds.map((lessonId, orderIndex) => ({ lessonId, orderIndex })),
          },
        ],
      },
    ],
    lessons: lessonIds.map((id) => ({
      id,
      track,
      sourceLevel: 'A1',
      skill: 'grammar',
      title: id,
      explanation: null,
      examples: null,
    })),
    exercises: [],
    prerequisites: [],
    ...(conceptLinks ? { conceptLinks } : {}),
  };
}

function writeSeedDir(files: Record<string, SeedFile>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gait-seed-links-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(content));
  return dir;
}

function links(db: ReturnType<typeof createDbClient>) {
  return db.prepare('SELECT lesson_a_id, lesson_b_id FROM lesson_concept_links ORDER BY lesson_a_id').all();
}

describe('curriculum seed loader — concept links', () => {
  it('creates a link listed in both files it touches exactly once', () => {
    const link = { lessonAId: 'a1-gen-pronouns', lessonBId: 'a1-goe-pronouns' };
    const dir = writeSeedDir({
      'generic-a1.json': seedFile('generic', ['a1-gen-pronouns'], [link]),
      'goethe-a1.json': seedFile('goethe', ['a1-goe-pronouns'], [link]),
    });
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, dir);
    expect(links(db)).toEqual([{ lesson_a_id: 'a1-gen-pronouns', lesson_b_id: 'a1-goe-pronouns' }]);
  });

  it('stores a link in canonical order whatever order the file lists it in', () => {
    const reversed = { lessonAId: 'a1-z', lessonBId: 'a1-a' };
    const dir = writeSeedDir({
      'generic-a1.json': seedFile('generic', ['a1-z'], [reversed]),
      'goethe-a1.json': seedFile('goethe', ['a1-a'], [reversed]),
    });
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, dir);
    expect(links(db)).toEqual([{ lesson_a_id: 'a1-a', lesson_b_id: 'a1-z' }]);
  });

  it('skips a link whose other lesson does not exist', () => {
    const dir = writeSeedDir({
      'generic-a1.json': seedFile('generic', ['a1-alone'], [{ lessonAId: 'a1-alone', lessonBId: 'a1-missing' }]),
    });
    const db = createDbClient(':memory:');
    expect(() => loadSeedIfNeeded(db, dir)).not.toThrow();
    expect(links(db)).toEqual([]);
  });

  it('still loads files that have no conceptLinks list', () => {
    const dir = writeSeedDir({ 'generic-a1.json': seedFile('generic', ['a1-plain']) });
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, dir);
    expect(db.prepare('SELECT id FROM lessons').all()).toEqual([{ id: 'a1-plain' }]);
  });
});
