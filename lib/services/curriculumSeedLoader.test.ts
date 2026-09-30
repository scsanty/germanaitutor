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
    lessons: { id: string; track: string; explanation: string | null }[];
    withMilestones: boolean;
  }> = {}
) {
  writeFileSync(
    join(dir, name),
    JSON.stringify({
      seedVersion,
      formatVersion: 2,
      track: 'generic',
      level: 'A1',
      milestones:
        overrides.withMilestones === false
          ? []
          : [
              {
                milestone: { id: 'm1', track: 'generic', level: 'A1', title: 'M1', description: null, difficultyRank: 1 },
                lessonIds: ['l1'],
              },
            ],
      lessons: overrides.lessons ?? [
        {
          id: 'l1',
          track: 'generic',
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
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 (generic)',
          explanation: 'Generic explanation',
          examples: null,
        },
        {
          id: 'l1-telc',
          track: 'telc',
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
});

function seedDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(content));
  return dir;
}

function v2(version: string, milestones: { id: string; rank: number; lessonIds: string[] }[], lessonIds: string[]) {
  return {
    seedVersion: version,
    formatVersion: 2,
    track: 'generic',
    level: 'A1',
    milestones: milestones.map((m) => ({
      milestone: { id: m.id, track: 'generic', level: 'A1', title: m.id, description: null, difficultyRank: m.rank },
      lessonIds: m.lessonIds,
    })),
    lessons: lessonIds.map((id) => ({ id, track: 'generic', sourceLevel: 'A1', skill: 'grammar', title: id, explanation: null, examples: null })),
    exercises: [],
    prerequisites: [],
  };
}

describe('loadSeedIfNeeded (format v2)', () => {
  it('replaces the track+level structure: moves lessons, shelves unlisted ones, never deletes Unsorted', () => {
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, seedDir({ 'a.json': v2('1', [{ id: 'm1', rank: 1, lessonIds: ['l1', 'l2'] }], ['l1', 'l2']) }));
    db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('admin-m', 'generic', 'A1', 'Mine', 5);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('mine', 'generic', 'A1', 'grammar', 'Mine');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('mine', 'admin-m');`);

    loadSeedIfNeeded(
      db,
      seedDir({ 'a.json': v2('2', [{ id: 'm1', rank: 1, lessonIds: ['l1'] }, { id: 'm2', rank: 2, lessonIds: ['l2'] }], ['l1', 'l2', 'l3']) })
    );

    expect(db.prepare('SELECT lesson_id, milestone_id FROM lesson_placements ORDER BY lesson_id').all()).toEqual([
      { lesson_id: 'l1', milestone_id: 'm1' },
      { lesson_id: 'l2', milestone_id: 'm2' },
      { lesson_id: 'l3', milestone_id: 'generic-a1-unsorted' },
      { lesson_id: 'mine', milestone_id: 'generic-a1-unsorted' },
    ]);
    expect(db.prepare("SELECT id FROM milestones WHERE id = 'admin-m'").get()).toBeUndefined();
    expect(db.prepare("SELECT id FROM milestones WHERE id = 'generic-a1-unsorted'").get()).toBeTruthy();
  });

  it('rejects a v1 file by name and changes nothing', () => {
    const db = createDbClient(':memory:');
    const v1 = { seedVersion: '9', track: 'generic', level: 'A1', milestones: [], lessons: [], exercises: [], prerequisites: [] };
    expect(() => loadSeedIfNeeded(db, seedDir({ 'old.json': v1 }))).toThrow(/old\.json uses format none; this app needs format 2 \(milestones without sections\)/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM milestones').get()).toEqual({ n: 0 });
  });
});
