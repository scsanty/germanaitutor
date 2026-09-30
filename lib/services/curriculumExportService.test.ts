import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded } from './curriculumSeedLoader';
import { createCurriculumExportService, seedFileName } from './curriculumExportService';

const REPO_SEED_DIR = join(process.cwd(), 'data', 'curriculum-seed');

function count(db: ReturnType<typeof createDbClient>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('curriculumExportService', () => {
  it('names files the way data/curriculum-seed does', () => {
    expect(seedFileName('generic', 'A1')).toBe('generic-a1.json');
    expect(seedFileName('goethe', 'C1')).toBe('goethe-c1.json');
  });

  it('exports all 15 track+level files with the current seed version', () => {
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, REPO_SEED_DIR);
    const files = createCurriculumExportService(db).exportAll();
    expect(files.map((f) => f.fileName)).toHaveLength(15);
    expect(files.map((f) => f.fileName)).toContain('telc-b2.json');
    const version = (db.prepare('SELECT seed_version FROM curriculum_meta').get() as { seed_version: string }).seed_version;
    expect(new Set(files.map((f) => f.seed.seedVersion))).toEqual(new Set([version]));
    expect(files.every((f) => f.seed.lessons.every((l) => !('conceptId' in l)))).toBe(true);
  });

  it('round-trips the whole curriculum through the seed loader', () => {
    const source = createDbClient(':memory:');
    loadSeedIfNeeded(source, REPO_SEED_DIR);
    const exported = createCurriculumExportService(source).exportAll();

    const dir = mkdtempSync(join(tmpdir(), 'gait-export-'));
    for (const { fileName, seed } of exported) writeFileSync(join(dir, fileName), JSON.stringify(seed));
    const target = createDbClient(':memory:');
    loadSeedIfNeeded(target, dir);

    for (const table of ['lessons', 'exercises', 'milestones', 'sections', 'lesson_placements', 'lesson_prerequisites']) {
      expect({ table, n: count(target, table) }).toEqual({ table, n: count(source, table) });
    }
    expect(createCurriculumExportService(target).exportAll()).toEqual(exported);
  });

  it('includes concept links touching the file and keeps exercises in the order they were added', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('g-m', 'generic', 'A1', 'M', 0), ('o-m', 'goethe', 'A1', 'M', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('g-s', 'g-m', 'S', 0), ('o-s', 'o-m', 'S', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES
        ('a1-g', 'generic', 'A1', 'grammar', 'G'), ('a1-o', 'goethe', 'A1', 'grammar', 'O');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-g', 'g-s', 0), ('a1-o', 'o-s', 0);
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-g__ex10', 'a1-g', 'free_text', '{"prompt":"p","modelAnswer":"m"}'),
        ('a1-g__ex2', 'a1-g', 'free_text', '{"prompt":"p","modelAnswer":"m"}');
      INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES ('a1-g', 'a1-o');
    `);
    const seed = createCurriculumExportService(db).exportTrackLevel('generic', 'A1');
    expect(seed.conceptLinks).toEqual([{ lessonAId: 'a1-g', lessonBId: 'a1-o' }]);
    expect(seed.exercises.map((e) => e.id)).toEqual(['a1-g__ex10', 'a1-g__ex2']);
    expect(seed.milestones[0].sections[0].lessonRefs).toEqual([{ lessonId: 'a1-g', orderIndex: 0 }]);
  });

  it('exports only approved practice exercises, and they load back as approved', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('g-m', 'generic', 'A1', 'M', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('g-s', 'g-m', 'S', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g', 'generic', 'A1', 'grammar', 'G');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-g', 'g-s', 0);
      INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at) VALUES
        ('a1-g__px-b', 'a1-g', 'fill_blank', '{"textWithBlank":"b ___","correctAnswer":"x"}', 'approved', '2026-09-29T10:00:02.000Z'),
        ('a1-g__px-a', 'a1-g', 'fill_blank', '{"textWithBlank":"a ___","correctAnswer":"x"}', 'approved', '2026-09-29T10:00:01.000Z'),
        ('a1-g__px-u', 'a1-g', 'fill_blank', '{"textWithBlank":"u ___","correctAnswer":"x"}', 'unreviewed', '2026-09-29T10:00:03.000Z'),
        ('a1-g__px-r', 'a1-g', 'fill_blank', '{"textWithBlank":"r ___","correctAnswer":"x"}', 'rejected', '2026-09-29T10:00:04.000Z');
    `);
    const seed = createCurriculumExportService(db).exportTrackLevel('generic', 'A1');
    expect(seed.practice).toEqual([
      { id: 'a1-g__px-a', lessonId: 'a1-g', type: 'fill_blank', content: { textWithBlank: 'a ___', correctAnswer: 'x' } },
      { id: 'a1-g__px-b', lessonId: 'a1-g', type: 'fill_blank', content: { textWithBlank: 'b ___', correctAnswer: 'x' } },
    ]);

    const dir = mkdtempSync(join(tmpdir(), 'gait-export-practice-'));
    writeFileSync(join(dir, 'generic-a1.json'), JSON.stringify({ ...seed, seedVersion: 'next' }));
    const target = createDbClient(':memory:');
    loadSeedIfNeeded(target, dir);
    expect(createCurriculumExportService(target).exportTrackLevel('generic', 'A1').practice).toEqual(seed.practice);
  });
});
