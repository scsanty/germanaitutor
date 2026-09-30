import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDbClient } from '../db/client';
import { prerequisiteScopeViolations } from '../tutoring/gating';
import { loadSeedIfNeeded, type SeedFile } from './curriculumSeedLoader';
import { loadLevelGating } from './levelGating';

const DIR = join(process.cwd(), 'data', 'curriculum-seed');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const seeds = files.map((f) => [f, JSON.parse(readFileSync(join(DIR, f), 'utf8')) as SeedFile] as const);

describe('bundled curriculum seeds', () => {
  it('has all 15 track+level files at seed version 4, format 2', () => {
    expect(files).toHaveLength(15);
    for (const [, seed] of seeds) {
      expect(seed.formatVersion).toBe(2);
      expect(seed.seedVersion).toBe('4');
    }
  });

  it.each(seeds)('%s: 3–5 difficulty milestones with titles, descriptions, ids, and ranks', (_file, seed) => {
    expect(seed.milestones.length).toBeGreaterThanOrEqual(3);
    expect(seed.milestones.length).toBeLessThanOrEqual(5);
    const prefix = `${seed.track}-${seed.level.toLowerCase()}-m`;
    for (const { milestone, lessonIds } of seed.milestones) {
      expect(milestone.id.startsWith(`${prefix}${milestone.difficultyRank}-`)).toBe(true);
      expect(Number.isInteger(milestone.difficultyRank) && milestone.difficultyRank >= 1).toBe(true);
      expect(milestone.title.trim()).not.toBe('');
      expect((milestone.description ?? '').trim()).not.toBe('');
      expect(milestone.track).toBe(seed.track);
      expect(milestone.level).toBe(seed.level);
      expect(lessonIds.length).toBeGreaterThan(0);
    }
    const ranks = seed.milestones.map((m) => m.milestone.difficultyRank);
    expect(Math.min(...ranks)).toBe(1);
  });

  it.each(seeds)('%s: places every lesson exactly once', (_file, seed) => {
    const placed = seed.milestones.flatMap((m) => m.lessonIds);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(seed.lessons.map((l) => l.id).sort());
  });

  it.each(seeds)('%s: keeps every prerequisite in the same milestone or a lower rank', (_file, seed) => {
    const placement = new Map<string, { milestoneId: string; rank: number }>();
    for (const { milestone, lessonIds } of seed.milestones) {
      for (const id of lessonIds) placement.set(id, { milestoneId: milestone.id, rank: milestone.difficultyRank });
    }
    const edges = seed.prerequisites.map((p) => ({ lessonId: p.lessonId, prerequisiteId: p.prerequisiteLessonId }));
    expect(prerequisiteScopeViolations(edges, (id) => placement.get(id))).toEqual([]);
  });

  it('loads into a fresh database with the first rank open in every track+level', () => {
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, DIR);
    for (const [, seed] of seeds) {
      const gating = loadLevelGating(db, seed.track, seed.level);
      const first = gating.milestones.filter((m) => m.rank === 1);
      expect(first.length).toBeGreaterThan(0);
      for (const m of first) expect(gating.states.get(m.id)).toBe('open');
    }
  });
});
