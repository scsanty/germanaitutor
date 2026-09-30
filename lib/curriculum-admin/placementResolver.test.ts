import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { resolvePlacement } from './placementResolver';
import { ensureUnsortedExists } from './unsortedBucket';

function setup() {
  const db = createDbClient(':memory:');
  db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES
    ('g-a1-m1', 'generic', 'A1', 'Basics', 1), ('g-a2-m1', 'generic', 'A2', 'Next', 1)`);
  return db;
}

describe('resolvePlacement', () => {
  it('returns an existing milestone of the same track+level', () => {
    expect(resolvePlacement(setup(), 'generic', 'A1', { milestoneId: 'g-a1-m1' }, 'create')).toBe('g-a1-m1');
  });

  it('rejects a milestone of another track+level, or one that does not exist', () => {
    const db = setup();
    expect(() => resolvePlacement(db, 'generic', 'A1', { milestoneId: 'g-a2-m1' }, 'create')).toThrow(/belongs to generic\/A2/);
    expect(() => resolvePlacement(db, 'generic', 'A1', { milestoneId: 'nope' }, 'create')).toThrow(/not found/);
  });

  it('rejects creating directly into Unsorted but allows moving there on update', () => {
    const db = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    expect(() => resolvePlacement(db, 'generic', 'A1', { milestoneId }, 'create')).toThrow(/Unsorted/);
    expect(resolvePlacement(db, 'generic', 'A1', { milestoneId }, 'update')).toBe(milestoneId);
  });

  it('creates a new milestone with its rank', () => {
    const db = setup();
    const id = resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: 'Later', newMilestoneTitleDe: 'Später', newMilestoneRank: 3 }, 'create');
    expect(db.prepare('SELECT title, title_de, difficulty_rank FROM milestones WHERE id = ?').get(id)).toEqual({
      title: 'Later',
      title_de: 'Später',
      difficulty_rank: 3,
    });
  });

  it('rejects an invalid rank or an empty title', () => {
    const db = setup();
    expect(() => resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: 'X', newMilestoneTitleDe: 'X', newMilestoneRank: 0 }, 'create')).toThrow(/rank/);
    expect(() => resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: 'X', newMilestoneTitleDe: ' ', newMilestoneRank: 2 }, 'create')).toThrow(/German title/);
    expect(() => resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: ' ', newMilestoneTitleDe: 'X', newMilestoneRank: 2 }, 'create')).toThrow(/title/);
  });
});
