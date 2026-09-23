import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from './unsortedBucket';

describe('ensureUnsortedExists', () => {
  it('creates the milestone and section on first call', () => {
    const db = createDbClient(':memory:');
    const result = ensureUnsortedExists(db, 'generic', 'A1');
    expect(result.milestoneId).toBe('generic-a1-unsorted');
    const milestone = db.prepare('SELECT title FROM milestones WHERE id = ?').get(result.milestoneId) as {
      title: string;
    };
    expect(milestone.title).toBe('Unsorted');
    const section = db.prepare('SELECT milestone_id FROM sections WHERE id = ?').get(result.sectionId) as {
      milestone_id: string;
    };
    expect(section.milestone_id).toBe(result.milestoneId);
  });

  it('is idempotent — a second call does not create duplicates', () => {
    const db = createDbClient(':memory:');
    ensureUnsortedExists(db, 'generic', 'A1');
    ensureUnsortedExists(db, 'generic', 'A1');
    const count = db.prepare('SELECT count(*) as c FROM milestones WHERE id = ?').get('generic-a1-unsorted') as {
      c: number;
    };
    expect(count.c).toBe(1);
  });

  it('creates independent buckets per track+level', () => {
    const db = createDbClient(':memory:');
    const a = ensureUnsortedExists(db, 'generic', 'A1');
    const b = ensureUnsortedExists(db, 'telc', 'B1');
    expect(a.milestoneId).not.toBe(b.milestoneId);
  });
});
