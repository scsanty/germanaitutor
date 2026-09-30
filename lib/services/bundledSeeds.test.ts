import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureBundledSeeds, loadBundledSeeds } from './bundledSeeds';
import { createPlacementService } from './placementService';

describe('loadBundledSeeds', () => {
  it('loads the bundled curriculum and placement exam into an empty DB', () => {
    const db = createDbClient(':memory:');
    const lessonCountBefore = (db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number }).n;
    expect(lessonCountBefore).toBe(0);
    expect(createPlacementService(db).questionCount()).toBe(0);

    loadBundledSeeds(db);

    const lessonCountAfter = (db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number }).n;
    expect(lessonCountAfter).toBeGreaterThan(0);
    expect(createPlacementService(db).questionCount()).toBeGreaterThan(0);
  });

  it('does not reload an exam that is already present', () => {
    const db = createDbClient(':memory:');
    createPlacementService(db).replaceExam([
      { id: 'custom', level: 'A1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 } },
    ]);

    loadBundledSeeds(db);

    expect(createPlacementService(db).questionCount()).toBe(1);
  });
});

describe('ensureBundledSeeds', () => {
  it('does nothing until called, then seeds once', () => {
    const db = createDbClient(':memory:');
    const getDb = vi.fn(() => db);
    expect(getDb).not.toHaveBeenCalled();
    ensureBundledSeeds(getDb);
    ensureBundledSeeds(getDb);
    expect(getDb).toHaveBeenCalledTimes(1);
    expect((db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number }).n).toBeGreaterThan(0);
  });
});
