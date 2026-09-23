import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { resolvePlacement } from './placementResolver';

describe('resolvePlacement', () => {
  it('returns the given sectionId unchanged when it exists', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
    `);
    const result = resolvePlacement(db, 'generic', 'A1', { sectionId: 's1' });
    expect(result).toBe('s1');
  });

  it('throws when the given sectionId does not exist', () => {
    const db = createDbClient(':memory:');
    expect(() => resolvePlacement(db, 'generic', 'A1', { sectionId: 'nope' })).toThrow();
  });

  it('creates a new section under an existing milestone', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);`);
    const sectionId = resolvePlacement(db, 'generic', 'A1', { milestoneId: 'm1', newSectionTitle: 'New Section' });
    const section = db.prepare('SELECT milestone_id, title FROM sections WHERE id = ?').get(sectionId) as {
      milestone_id: string;
      title: string;
    };
    expect(section.milestone_id).toBe('m1');
    expect(section.title).toBe('New Section');
  });

  it('throws when the given milestoneId does not exist', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      resolvePlacement(db, 'generic', 'A1', { milestoneId: 'nope', newSectionTitle: 'X' })
    ).toThrow();
  });

  it('creates a brand-new milestone and its first section', () => {
    const db = createDbClient(':memory:');
    const sectionId = resolvePlacement(db, 'generic', 'A1', {
      newMilestoneTitle: 'New Milestone',
      newSectionTitle: 'First Section',
    });
    const section = db.prepare('SELECT milestone_id, title FROM sections WHERE id = ?').get(sectionId) as {
      milestone_id: string;
      title: string;
    };
    expect(section.title).toBe('First Section');
    const milestone = db.prepare('SELECT track, level, title FROM milestones WHERE id = ?').get(
      section.milestone_id
    ) as { track: string; level: string; title: string };
    expect(milestone).toEqual({ track: 'generic', level: 'A1', title: 'New Milestone' });
  });

  it('appends new milestones after existing ones by order_index', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 5);`);
    const sectionId = resolvePlacement(db, 'generic', 'A1', {
      newMilestoneTitle: 'New',
      newSectionTitle: 'S',
    });
    const section = db.prepare('SELECT milestone_id FROM sections WHERE id = ?').get(sectionId) as {
      milestone_id: string;
    };
    const milestone = db.prepare('SELECT order_index FROM milestones WHERE id = ?').get(section.milestone_id) as {
      order_index: number;
    };
    expect(milestone.order_index).toBe(6);
  });
});
