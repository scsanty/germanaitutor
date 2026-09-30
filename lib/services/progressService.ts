import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import type { ExerciseType, Skill } from '../curriculum/types';
import { unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { lessonStatus } from '../tutoring/completion';
import { toExerciseView } from '../tutoring/exerciseView';
import { isAtOrBelow, LEVELS, levelIndex } from '../tutoring/levels';
import type { CurriculumTree, DailyQueue, LessonView, TreeLesson } from '../tutoring/progressTypes';
import { remainingReviews, selectDueItems, suggestNextLesson } from '../tutoring/queue';
import { createCurriculumService } from './curriculumService';
import { createProfileService } from './profileService';

interface VisibleLessonRow {
  id: string;
  title: string;
  skill: Skill;
  milestone_id: string;
}

interface DoneState {
  completed: Set<string>;
  coveredVia: Map<string, Track>;
}

interface DueRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: ExerciseType;
  content: string;
  lesson_title: string;
  next_due_at: string;
}

export function createProgressService(db: Database.Database) {
  const profiles = createProfileService(db);
  const curriculum = createCurriculumService(db);

  // Own completion is a stored row. Shared completion is display-only: a concept-linked lesson
  // (always in another track) with its own completion (spec: Completion).
  function loadDoneState(): DoneState {
    const completed = new Set(
      (db.prepare('SELECT lesson_id FROM lesson_completions').all() as { lesson_id: string }[]).map((r) => r.lesson_id)
    );
    const links = db
      .prepare(
        `SELECT c.lesson_a_id AS a, c.lesson_b_id AS b, la.track AS a_track, lb.track AS b_track
         FROM lesson_concept_links c
         JOIN lessons la ON la.id = c.lesson_a_id
         JOIN lessons lb ON lb.id = c.lesson_b_id
         ORDER BY c.id`
      )
      .all() as { a: string; b: string; a_track: Track; b_track: Track }[];
    const coveredVia = new Map<string, Track>();
    for (const link of links) {
      if (completed.has(link.a) && !completed.has(link.b) && !coveredVia.has(link.b)) coveredVia.set(link.b, link.a_track);
      if (completed.has(link.b) && !completed.has(link.a) && !coveredVia.has(link.a)) coveredVia.set(link.a, link.b_track);
    }
    return { completed, coveredVia };
  }

  function isDone(state: DoneState, lessonId: string): boolean {
    return state.completed.has(lessonId) || state.coveredVia.has(lessonId);
  }

  // The student-visible lessons of a track+level, in tree order. The Unsorted bucket is admin-only.
  function visibleLessons(track: Track, level: CefrLevel): VisibleLessonRow[] {
    return db
      .prepare(
        `SELECT l.id, l.title, l.skill, p.milestone_id
         FROM milestones m
         JOIN lesson_placements p ON p.milestone_id = m.id
         JOIN lessons l ON l.id = p.lesson_id
         WHERE m.track = ? AND m.level = ? AND m.id != ?
         ORDER BY m.difficulty_rank, m.id, l.title, l.id`
      )
      .all(track, level, unsortedMilestoneId(track, level)) as VisibleLessonRow[];
  }

  function prerequisitesByLesson(): Map<string, { id: string; title: string }[]> {
    const rows = db
      .prepare(
        `SELECT lp.lesson_id, l.id, l.title
         FROM lesson_prerequisites lp
         JOIN lessons l ON l.id = lp.prerequisite_lesson_id
         ORDER BY lp.lesson_id, l.title`
      )
      .all() as { lesson_id: string; id: string; title: string }[];
    const map = new Map<string, { id: string; title: string }[]>();
    for (const row of rows) {
      const list = map.get(row.lesson_id) ?? [];
      list.push({ id: row.id, title: row.title });
      map.set(row.lesson_id, list);
    }
    return map;
  }

  function getTree(): CurriculumTree {
    const { activeTrack: track, activeLevel: level } = profiles.getProfile();
    const done = loadDoneState();
    const prerequisites = prerequisitesByLesson();
    const attempted = new Set(
      (db.prepare('SELECT DISTINCT lesson_id FROM lesson_attempts').all() as { lesson_id: string }[]).map((r) => r.lesson_id)
    );

    const lessonsByMilestone = new Map<string, TreeLesson[]>();
    for (const row of visibleLessons(track, level)) {
      const list = lessonsByMilestone.get(row.milestone_id) ?? [];
      list.push({
        id: row.id,
        title: row.title,
        skill: row.skill,
        status: lessonStatus({
          completed: done.completed.has(row.id),
          covered: done.coveredVia.has(row.id),
          attempted: attempted.has(row.id),
        }),
        coveredVia: done.coveredVia.get(row.id) ?? null,
        missingPrerequisites: (prerequisites.get(row.id) ?? []).filter((p) => !isDone(done, p.id)),
      });
      lessonsByMilestone.set(row.milestone_id, list);
    }

    const milestones = db
      .prepare('SELECT id, title FROM milestones WHERE track = ? AND level = ? AND id != ? ORDER BY difficulty_rank, id')
      .all(track, level, unsortedMilestoneId(track, level)) as { id: string; title: string }[];
    return {
      track,
      level,
      milestones: milestones.map((m) => ({ id: m.id, title: m.title, lessons: lessonsByMilestone.get(m.id) ?? [] })),
    };
  }

  // Spec: Level Unlocking. A level with no visible lessons never counts as finished.
  function isLevelFinished(track: Track, level: CefrLevel): boolean {
    const lessons = visibleLessons(track, level);
    if (lessons.length === 0) return false;
    const done = loadDoneState();
    return lessons.every((lesson) => isDone(done, lesson.id));
  }

  function isCompleted(lessonId: string): boolean {
    return !!db.prepare('SELECT 1 FROM lesson_completions WHERE lesson_id = ?').get(lessonId);
  }

  // Exercises of the lesson with at least one correct or almost attempt, in exercise order.
  function passedExerciseIds(lessonId: string): string[] {
    const rows = db
      .prepare(
        `SELECT e.id FROM exercises e
         WHERE e.lesson_id = ?
           AND EXISTS (SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.result IN ('correct', 'almost'))
         ORDER BY e.rowid`
      )
      .all(lessonId) as { id: string }[];
    return rows.map((r) => r.id);
  }

  function getLessonView(lessonId: string): LessonView | null {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) return null;
    if (!isAtOrBelow(lesson.sourceLevel, profiles.getProfile().highestUnlockedLevel)) {
      return {
        locked: true,
        id: lesson.id,
        title: lesson.title,
        level: lesson.sourceLevel,
        unlocksAfter: LEVELS[levelIndex(lesson.sourceLevel) - 1],
      };
    }
    const done = loadDoneState();
    return {
      locked: false,
      id: lesson.id,
      title: lesson.title,
      track: lesson.track,
      level: lesson.sourceLevel,
      skill: lesson.skill,
      explanation: lesson.explanation,
      examples: lesson.examples,
      exercises: curriculum.getExercises(lesson.id, lesson.track).map(toExerciseView),
      passedExerciseIds: passedExerciseIds(lesson.id),
      completed: done.completed.has(lesson.id),
      prerequisites: (prerequisitesByLesson().get(lesson.id) ?? []).map((p) => ({ ...p, done: isDone(done, p.id) })),
    };
  }

  // Spec: Pages and Navigation, `/queue`. Reviews follow what was learned, not where it's
  // filed, so lessons an admin moved into Unsorted still count.
  function getDailyQueue(today: string): DailyQueue {
    const { activeTrack: track, activeLevel: level, dailyReviewCap: cap } = profiles.getProfile();
    const answeredToday = (
      db.prepare(`SELECT COUNT(*) AS n FROM lesson_attempts WHERE source = 'queue' AND answered_on = ?`).get(today) as {
        n: number;
      }
    ).n;
    const rows = db
      .prepare(
        `SELECT e.id, e.lesson_id, e.track, e.type, e.content, l.title AS lesson_title, st.next_due_at
         FROM exercise_srs_state st
         JOIN exercises e ON e.id = st.exercise_id
         JOIN lessons l ON l.id = e.lesson_id
         JOIN lesson_placements p ON p.lesson_id = l.id
         JOIN milestones m ON m.id = p.milestone_id
         WHERE m.track = ? AND m.level = ? AND st.next_due_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.source = 'queue' AND a.answered_on = ?
           )
         ORDER BY st.next_due_at, COALESCE(m.difficulty_rank, 1000000), m.id, e.rowid`
      )
      .all(track, level, today, today) as DueRow[];
    const due = selectDueItems(
      rows.map((row) => ({ ...row, exerciseId: row.id, nextDueAt: row.next_due_at })),
      today,
      remainingReviews(cap, answeredToday)
    );

    const done = loadDoneState();
    const prerequisites = prerequisitesByLesson();
    const lessons = visibleLessons(track, level);
    const suggestedId = suggestNextLesson(
      lessons.map((lesson) => ({
        id: lesson.id,
        done: isDone(done, lesson.id),
        prerequisiteIds: (prerequisites.get(lesson.id) ?? []).map((p) => p.id),
      })),
      new Set([...done.completed, ...done.coveredVia.keys()])
    );
    const suggested = lessons.find((lesson) => lesson.id === suggestedId);

    return {
      track,
      level,
      cap,
      answeredToday,
      items: due.map((row) => ({
        lessonId: row.lesson_id,
        lessonTitle: row.lesson_title,
        exercise: toExerciseView({
          id: row.id,
          lessonId: row.lesson_id,
          track: row.track,
          type: row.type,
          content: JSON.parse(row.content),
        }),
      })),
      suggestedLesson: suggested ? { id: suggested.id, title: suggested.title } : null,
    };
  }

  return { getTree, getLessonView, isLevelFinished, isCompleted, passedExerciseIds, getDailyQueue };
}

export type ProgressService = ReturnType<typeof createProgressService>;
