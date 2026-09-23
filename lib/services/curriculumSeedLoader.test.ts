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
  overrides: Partial<{
    lessons: { id: string; track: string; conceptId: string | null; explanation: string | null }[];
    withMilestones: boolean;
  }> = {}
) {
  writeFileSync(
    join(dir, name),
    JSON.stringify({
      seedVersion,
      track: 'generic',
      level: 'A1',
      milestones:
        overrides.withMilestones === false
          ? []
          : [
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
      lessons: overrides.lessons ?? [
        {
          id: 'l1',
          track: 'generic',
          conceptId: null,
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1',
          explanation: 'Canonical explanation',
          examples: ['ex'],
        },
      ],
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

    const lesson = db.prepare('SELECT title, track FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.title).toBe('L1');
    expect(lesson.track).toBe('generic');
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

  it('loads lessons from different tracks independently, without touching lesson_track_overrides', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1', {
      withMilestones: false,
      lessons: [
        {
          id: 'l1-generic',
          track: 'generic',
          conceptId: 'shared-concept',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 (generic)',
          explanation: 'Generic explanation',
          examples: null,
        },
        {
          id: 'l1-telc',
          track: 'telc',
          conceptId: 'shared-concept',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 (telc)',
          explanation: 'telc-specific explanation',
          examples: null,
        },
      ] as any,
    });
    loadSeedIfNeeded(db, seedDir);

    const genericLesson = db.prepare('SELECT explanation, track FROM lessons WHERE id = ?').get('l1-generic') as any;
    const telcLesson = db.prepare('SELECT explanation, track FROM lessons WHERE id = ?').get('l1-telc') as any;
    expect(genericLesson.explanation).toBe('Generic explanation');
    expect(genericLesson.track).toBe('generic');
    expect(telcLesson.explanation).toBe('telc-specific explanation');
    expect(telcLesson.track).toBe('telc');

    const overrideCount = db.prepare('SELECT count(*) as c FROM lesson_track_overrides').get() as { c: number };
    expect(overrideCount.c).toBe(0);
  });

  it('links lessons across tracks that share a concept_id', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1', {
      withMilestones: false,
      lessons: [
        {
          id: 'l1-generic',
          track: 'generic',
          conceptId: 'shared-concept',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 (generic)',
          explanation: 'a',
          examples: null,
        },
        {
          id: 'l1-telc',
          track: 'telc',
          conceptId: 'shared-concept',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 (telc)',
          explanation: 'b',
          examples: null,
        },
        {
          id: 'l1-goethe',
          track: 'goethe',
          conceptId: null,
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 (goethe)',
          explanation: 'c',
          examples: null,
        },
      ] as any,
    });
    loadSeedIfNeeded(db, seedDir);

    const linked = db.prepare('SELECT id FROM lessons WHERE concept_id = ? ORDER BY id').all('shared-concept') as {
      id: string;
    }[];
    expect(linked.map((r) => r.id)).toEqual(['l1-generic', 'l1-telc']);
  });
});
