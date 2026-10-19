import type Database from 'better-sqlite3';
import { TAXONOMY, keywordMatches, normalizeCategory, type ErrorCategory } from '../errors/taxonomy';
import { trimSnippet } from '../errors/snippets';

// Spec: Error Log. Cross-module record of mistakes (lessons, Teil, Freestyle, later Speaking).
export type ErrorSource = 'lesson' | 'teil' | 'freestyle_chat' | 'freestyle_writing' | 'speaking';

export interface ErrorEntry {
  category: string;
  wrong: string;
  right: string;
}

export interface TopMistake {
  category: ErrorCategory;
  count: number;
  example: { wrong: string; right: string };
}

export interface ErrorLogDeps {
  now?: () => Date;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function createErrorLogService(db: Database.Database, deps: ErrorLogDeps = {}) {
  const now = () => (deps.now ?? (() => new Date()))();

  function record(source: ErrorSource, entries: ErrorEntry[]): void {
    const insert = db.prepare('INSERT INTO error_log (source, category, wrong, "right", created_at) VALUES (?, ?, ?, ?, ?)');
    const at = now().toISOString();
    db.transaction(() => {
      for (const e of entries) {
        const wrong = trimSnippet(e.wrong ?? '');
        if (!wrong) continue;
        insert.run(source, normalizeCategory(e.category), wrong, trimSnippet(e.right ?? ''), at);
      }
    })();
  }

  function topMistakes(limit = 5): TopMistake[] {
    const since = new Date(now().getTime() - WINDOW_MS).toISOString();
    const rows = db
      .prepare(
        `SELECT category, COUNT(*) AS n FROM error_log WHERE created_at >= ?
         GROUP BY category ORDER BY COUNT(*) DESC, MAX(id) DESC LIMIT ?`
      )
      .all(since, limit) as { category: string; n: number }[];
    const latest = db.prepare(
      'SELECT wrong, "right" AS right_text FROM error_log WHERE category = ? AND created_at >= ? ORDER BY id DESC LIMIT 1'
    );
    return rows.map((r) => {
      const ex = latest.get(r.category, since) as { wrong: string; right_text: string };
      return {
        category: TAXONOMY.find((c) => c.id === r.category) ?? TAXONOMY[TAXONOMY.length - 1],
        count: r.n,
        example: { wrong: ex.wrong, right: ex.right_text },
      };
    });
  }

  // The grammar lesson matching the most keywords wins; ties go to the earlier (lower-ranked) milestone.
  function bestLesson(categoryId: string, scope: { track: string; level: string } | null): { id: string; title: string } | null {
    const keywords = TAXONOMY.find((c) => c.id === categoryId)?.keywords ?? [];
    if (keywords.length === 0) return null;
    const lessons = db
      .prepare(
        `SELECT l.id, l.title, l.title_de FROM lessons l
         JOIN lesson_placements p ON p.lesson_id = l.id
         JOIN milestones m ON m.id = p.milestone_id
         WHERE l.skill = 'grammar' AND m.difficulty_rank IS NOT NULL
           AND (? IS NULL OR (l.track = ? AND l.source_level = ?))
         ORDER BY m.difficulty_rank, l.title, l.id`
      )
      .all(scope ? 1 : null, scope?.track ?? null, scope?.level ?? null) as { id: string; title: string; title_de: string }[];
    let hit: { id: string; title: string } | null = null;
    let best = 0;
    for (const l of lessons) {
      const score = keywords.filter((k) => keywordMatches(l.title, k) || keywordMatches(l.title_de, k)).length;
      if (score > best) {
        best = score;
        hit = l;
      }
    }
    return hit ? { id: hit.id, title: hit.title } : null;
  }

  function lessonFor(categoryId: string, track: string, level: string): { id: string; title: string } | null {
    return bestLesson(categoryId, { track, level });
  }

  // The best grammar lesson for a category in any track or level, for the Freestyle drill topic.
  function anyLessonFor(categoryId: string): { id: string; title: string } | null {
    return bestLesson(categoryId, null);
  }

  return { record, topMistakes, lessonFor, anyLessonFor };
}

export type ErrorLogService = ReturnType<typeof createErrorLogService>;

// S7: graders log after a successful grade, and a logging failure must never break grading.
export function recordMistakes(db: Database.Database, source: ErrorSource, entries: ErrorEntry[], deps: ErrorLogDeps = {}): void {
  if (entries.length === 0) return;
  try {
    createErrorLogService(db, deps).record(source, entries);
  } catch (err) {
    console.error(`Recording ${source} mistakes in the error log failed:`, err);
  }
}
