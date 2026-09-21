import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { exportSeed } from './exportSeed';

describe('exportSeed', () => {
  it('writes one JSON file per populated track+level, with canonical lessons separate from overrides', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('l1', 'A1', 'grammar', 'L1', 'Canonical explanation', '["ex"]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
    `);
    const outDir = mkdtempSync(join(tmpdir(), 'gait-seed-export-'));
    exportSeed(db, outDir, '1');

    const filePath = join(outDir, 'generic-a1.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(content.seedVersion).toBe('1');
    expect(content.milestones[0].sections[0].lessonRefs[0].lessonId).toBe('l1');
    expect(content.lessons[0]).toMatchObject({ id: 'l1', explanation: 'Canonical explanation' });
    expect(content.overrides).toEqual([]);

    expect(existsSync(join(outDir, 'telc-a1.json'))).toBe(false);
  });

  it('exports a track override separately from the canonical lesson, and only for the matching track', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('telc-a1-m1', 'telc', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('telc-a1-m1-s1', 'telc-a1-m1', 'S1', 0);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('l1', 'A1', 'grammar', 'L1', 'Canonical explanation', '["ex"]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 'telc-a1-m1-s1', 0);
      INSERT INTO lesson_track_overrides (lesson_id, track, explanation, examples) VALUES ('l1', 'telc', 'TELC-specific explanation', '["telc ex"]');
    `);
    const outDir = mkdtempSync(join(tmpdir(), 'gait-seed-export-'));
    exportSeed(db, outDir, '1');

    const content = JSON.parse(readFileSync(join(outDir, 'telc-a1.json'), 'utf8'));
    expect(content.lessons[0].explanation).toBe('Canonical explanation');
    expect(content.overrides).toEqual([
      { lessonId: 'l1', track: 'telc', explanation: 'TELC-specific explanation', examples: ['telc ex'] },
    ]);
  });
});
