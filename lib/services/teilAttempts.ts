import type Database from 'better-sqlite3';
import { readFormat, type ExamFormat, type ExamPart } from '../exam/formats';
import type { TeilSetContent } from '../exam/teilSets';
import { PracticeError } from './practiceError';

// The teil_attempts row and the helpers both the Teil runner and the spoken parts read it with.
export interface AttemptRow {
  id: number;
  format_id: string;
  part_id: string;
  set_id: string | null;
  kind: 'practice' | 'mock';
  mock_id: string | null;
  score: number | null;
  max_score: number | null;
  overtime_seconds: number | null;
  started_at: string;
  finished_at: string | null;
  answers: string | null;
  grading_started_at: string | null;
  result: string | null;
}

// Review Focus 2: an attempt left open longer than this can't be submitted any more.
export const ABANDONED_MS = 3 * 3600 * 1000;
// B4: a grading lock older than this is stale (the provider times out after 90 s).
export const GRADING_LOCK_MS = 120 * 1000;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function partOf(formatId: string, partId: string): { format: ExamFormat; part: ExamPart } {
  // S1: readFormat accepts only known format-id shapes.
  const format = typeof formatId === 'string' ? readFormat(formatId) : null;
  const part = format?.parts.find((p) => p.id === partId);
  if (!format || !part) throw new PracticeError(`Unknown exam part: ${formatId}/${partId}`, 'not_found');
  return { format, part };
}

export function requireAttempt(db: Database.Database, attemptId: number): AttemptRow {
  const row = Number.isInteger(attemptId) ? (db.prepare('SELECT * FROM teil_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined) : undefined;
  if (!row) throw new PracticeError('Attempt not found', 'not_found');
  return row;
}

export function setOf(db: Database.Database, setId: string | null): TeilSetContent {
  const row = setId ? (db.prepare('SELECT content FROM teil_sets WHERE id = ?').get(setId) as { content: string } | undefined) : undefined;
  if (!row) throw new PracticeError('The set for this attempt no longer exists', 'not_found');
  return JSON.parse(row.content) as TeilSetContent;
}

// For a mock attempt the clock is its block's (B4): the shared start and the sum of the minutes of that
// block's parts in the mock. The written and oral blocks never share a clock.
export function allowedMinutes(db: Database.Database, row: AttemptRow, part: ExamPart, format: ExamFormat): number {
  if (!row.mock_id) return part.minutes;
  const block = format.blocks.find((b) => b.partIds.includes(row.part_id));
  const ids = db.prepare('SELECT part_id FROM teil_attempts WHERE mock_id = ?').all(row.mock_id) as { part_id: string }[];
  return ids
    .filter(({ part_id }) => !block || block.partIds.includes(part_id))
    .reduce((s, { part_id }) => s + (format.parts.find((p) => p.id === part_id)?.minutes ?? 0), 0);
}

// Overtime measured at request entry, before any AI call (S4), so grading time never counts.
export function overtimeSecondsOf(db: Database.Database, row: AttemptRow, part: ExamPart, format: ExamFormat, now: Date): number {
  const elapsedMs = now.getTime() - Date.parse(row.started_at);
  return Math.max(0, Math.floor(elapsedMs / 1000 - allowedMinutes(db, row, part, format) * 60));
}

// S4 + B4 (and B7 for spoken parts): an AI grading call runs while the attempt holds this lock, taken atomically
// on an open attempt with no live lock. Returns the release, which frees only this caller's own lock (never one a
// later caller took over after it went stale), or null when the lock is held or the attempt is finished.
export function takeGradingLock(db: Database.Database, attemptId: number, lockedAt: Date): (() => void) | null {
  const locked = db
    .prepare('UPDATE teil_attempts SET grading_started_at = ? WHERE id = ? AND finished_at IS NULL AND (grading_started_at IS NULL OR grading_started_at < ?)')
    .run(lockedAt.toISOString(), attemptId, new Date(lockedAt.getTime() - GRADING_LOCK_MS).toISOString());
  if (locked.changes === 0) return null;
  return () => {
    db.prepare('UPDATE teil_attempts SET grading_started_at = NULL WHERE id = ? AND finished_at IS NULL AND grading_started_at = ?').run(attemptId, lockedAt.toISOString());
  };
}

// True while another request holds a live grading lock on the attempt.
export function isGrading(row: AttemptRow, now: Date): boolean {
  return row.grading_started_at !== null && Date.parse(row.grading_started_at) >= now.getTime() - GRADING_LOCK_MS;
}
