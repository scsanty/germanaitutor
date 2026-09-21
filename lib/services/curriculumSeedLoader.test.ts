import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded } from './curriculumSeedLoader';

function writeSeedFile(
  dir: string,
  name: string,
  seedVersion: string,
  overrides: { lessonId: string; track: string; explanation: string | null; examples: string[] | null }[] = []
) {
  writeFileSync(
    join(dir, name),
    JSON.stringify({
      seedVersion,
      track: 'generic',
      level: 'A1',
      milestones: [
        {
          milestone: { id: 'm1', track: 'generic', level: 'A1', title: 'M1', description: null, orderIndex: 0 },
          sections: [
            {
              section: { id: 's1', milestoneId: 'm1', title: 'S1', description: null, orderIndex: 0 },
              lessonRefs: [{ lessonId: 'l1', orderIndex: 0 }],
            },
          ],
        },
      ],
      lessons: [
        { id: 'l1', sourceLevel: 'A1', skill: 'grammar', title: 'L1', explanation: 'Canonical explanation', examples: ['ex'] },
      ],
      overrides,
      exercises: [],
      prerequisites: [],
    })
  );
}

describe('loadSeedIfNeeded', () => {
  it('loads seed data into an empty DB and records the seed version', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');

    loadSeedIfNeeded(db, seedDir);

    const lesson = db.prepare('SELECT title FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.title).toBe('L1');
    const meta = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as any;
    expect(meta.seed_version).toBe('1');
  });

  it('does nothing when the bundled seed version matches what is already loaded', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');
    loadSeedIfNeeded(db, seedDir);

    db.prepare('UPDATE lessons SET title = ? WHERE id = ?').run('User-modified title', 'l1');
    loadSeedIfNeeded(db, seedDir);

    const lesson = db.prepare('SELECT title FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.title).toBe('User-modified title');
  });

  it('upserts changed content when the seed version is newer', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');
    loadSeedIfNeeded(db, seedDir);

    writeSeedFile(seedDir, 'generic-a1.json', '2');
    loadSeedIfNeeded(db, seedDir);

    const meta = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as any;
    expect(meta.seed_version).toBe('2');
  });

  it('never touches profile or memory_store data', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO profile (id, display_name) VALUES (1, 'Real User')`).run();
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');
    loadSeedIfNeeded(db, seedDir);
    const profile = db.prepare('SELECT display_name FROM profile WHERE id = 1').get() as any;
    expect(profile.display_name).toBe('Real User');
  });

  it('loads a track override without altering the canonical lesson content', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1', [
      { lessonId: 'l1', track: 'telc', explanation: 'TELC-specific explanation', examples: ['telc ex'] },
    ]);
    loadSeedIfNeeded(db, seedDir);

    const lesson = db.prepare('SELECT explanation FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.explanation).toBe('Canonical explanation');
    const override = db
      .prepare('SELECT explanation FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
      .get('l1', 'telc') as any;
    expect(override.explanation).toBe('TELC-specific explanation');
  });
});
