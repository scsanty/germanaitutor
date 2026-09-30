import type Database from 'better-sqlite3';
import type { Skill } from '../curriculum/types';
import { addDays, localDate } from '../tutoring/dates';
import type { DashboardView } from '../tutoring/dashboardViews';
import { createContentText } from './contentText';
import { loadLevelGating } from './levelGating';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';

export const ACTIVITY_DAYS = 84;
const SKILL_ORDER: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

// Spec: Pages, Dashboard.
export function createDashboardService(db: Database.Database, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());
  const profiles = createProfileService(db);
  const progress = createProgressService(db);
  const text = createContentText(db);

  function getDashboard(): DashboardView {
    const { activeTrack, activeLevel, uiLanguage } = profiles.getProfile();
    const today = localDate(now());
    const queue = progress.getDailyQueue(today);
    const gating = loadLevelGating(db, activeTrack, activeLevel);

    // Most recently attempted unfinished lesson that is still open; never a locked one.
    const recent = db
      .prepare(
        `SELECT a.lesson_id FROM lesson_attempts a
         WHERE a.source = 'lesson' AND NOT EXISTS (SELECT 1 FROM lesson_completions c WHERE c.lesson_id = a.lesson_id)
         GROUP BY a.lesson_id ORDER BY MAX(a.id) DESC`
      )
      .all() as { lesson_id: string }[];
    const open = recent.find((r) => !gating.isLessonLocked(r.lesson_id));
    const continueLesson = open
      ? { id: open.lesson_id, title: text.lessonTitle(open.lesson_id, uiLanguage) }
      : queue.suggestedLesson;

    const skillOf = db.prepare('SELECT skill FROM lessons WHERE id = ?');
    const tally = new Map<Skill, { done: number; total: number }>();
    for (const id of gating.milestones.flatMap((m) => m.lessonIds)) {
      const { skill } = skillOf.get(id) as { skill: Skill };
      const entry = tally.get(skill) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (gating.isDone(id)) entry.done += 1;
      tally.set(skill, entry);
    }
    const skills = SKILL_ORDER.filter((skill) => tally.has(skill)).map((skill) => ({ skill, ...tally.get(skill)! }));

    const start = addDays(today, -(ACTIVITY_DAYS - 1));
    const counts = new Map(
      (
        db
          .prepare('SELECT answered_on AS date, COUNT(*) AS count FROM lesson_attempts WHERE answered_on BETWEEN ? AND ? GROUP BY answered_on')
          .all(start, today) as { date: string; count: number }[]
      ).map((r) => [r.date, r.count])
    );
    const activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const date = addDays(start, i);
      return { date, count: counts.get(date) ?? 0 };
    });

    return { continueLesson, reviewsDue: queue.items.length, skills, activity };
  }

  return { getDashboard };
}
