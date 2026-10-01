import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ACTIVITY_DAYS, createDashboardService } from './dashboardService';
import { addAttempt, addSecondMilestone, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  const service = createDashboardService(db, { now: () => new Date(2026, 8, 29, 10, 0) });
  return { db, service };
}

describe('dashboardService', () => {
  it('continues the most recently attempted lesson that is not complete', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-greet__ex1', 'wrong', { on: '2026-09-27' });
    expect(service.getDashboard().continueLesson).toEqual({ id: 'a1-greet', title: 'Saying hello' });
  });

  it('falls back to the suggested next lesson when every attempted lesson is complete', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-greet__ex1', 'correct', { on: '2026-09-27' });
    markComplete(db, 'a1-greet');
    expect(service.getDashboard().continueLesson).toEqual({ id: 'a1-sein', title: 'The verb sein' });
  });

  it('never continues a locked lesson', () => {
    const { db, service } = setup();
    addSecondMilestone(db);
    addAttempt(db, 'a1-late__ex1', 'wrong', { on: '2026-09-28' });
    expect(service.getDashboard().continueLesson).toEqual({ id: 'a1-greet', title: 'Saying hello' });
  });

  it('ignores unfinished attempts from another track or level', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-goethe-greet__ex1', 'wrong', { on: '2026-09-28' });
    addAttempt(db, 'a2-past__ex1', 'wrong', { on: '2026-09-28' });
    expect(service.getDashboard().continueLesson).toEqual({ id: 'a1-greet', title: 'Saying hello' });
  });

  it('counts done lessons per skill in the active track and level', () => {
    const { db, service } = setup();
    markComplete(db, 'a1-greet');
    expect(service.getDashboard().skills).toEqual([
      { skill: 'grammar', done: 0, total: 1 },
      { skill: 'vocabulary', done: 1, total: 1 },
    ]);
  });

  // Review Focus 4: a full 84-day window ending today, zeros for quiet days, older attempts excluded.
  it('returns 84 days of activity, oldest first, with zeros and nothing older', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-greet__ex1', 'wrong', { on: '2026-09-29' });
    addAttempt(db, 'a1-greet__ex1', 'correct', { on: '2026-09-29', source: 'queue' });
    addAttempt(db, 'a1-greet__ex1', 'correct', { on: '2026-07-01' });
    const { activity } = service.getDashboard();
    expect(activity).toHaveLength(ACTIVITY_DAYS);
    expect(activity[0]).toEqual({ date: '2026-07-08', count: 0 });
    expect(activity[ACTIVITY_DAYS - 1]).toEqual({ date: '2026-09-29', count: 2 });
    expect(activity.reduce((sum, d) => sum + d.count, 0)).toBe(2);
  });

  it('reports the reviews left today', () => {
    expect(setup().service.getDashboard().reviewsDue).toBe(0);
  });
});
