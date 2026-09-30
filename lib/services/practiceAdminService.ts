import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import type { Exercise, ExerciseContent, ExerciseType, Skill } from '../curriculum/types';
import { hasInstructionKey, validateExerciseContent } from '../curriculum/exerciseContentValidation';
import { randomSuffix } from '../curriculum-admin/randomId';
import { correctAnswerFor } from '../tutoring/lessonAnswers';
import { flashcardRuleViolation } from './lessonAdminService';

export type PracticeReviewStatus = 'unreviewed' | 'approved' | 'rejected';

export interface PracticePoolItem {
  id: string;
  lessonId: string;
  lessonTitle: string;
  track: Track;
  level: CefrLevel;
  type: ExerciseType;
  content: ExerciseContent;
  correctAnswer: string | null;
  reviewStatus: PracticeReviewStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export class PracticeAdminError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_found' | 'bad_request'
  ) {
    super(message);
  }
}

interface ItemRow {
  id: string;
  lesson_id: string;
  lesson_title: string;
  track: Track;
  level: CefrLevel;
  skill: Skill;
  type: ExerciseType;
  content: string;
  review_status: PracticeReviewStatus;
  created_at: string;
  reviewed_at: string | null;
}

const SELECT_ITEMS = `
  SELECT p.id, p.lesson_id, l.title AS lesson_title, l.track, l.source_level AS level, l.skill,
         p.type, p.content, p.review_status, p.created_at, p.reviewed_at
  FROM practice_exercises p
  JOIN lessons l ON l.id = p.lesson_id`;

function rowToItem(row: ItemRow): PracticePoolItem {
  const content = JSON.parse(row.content) as ExerciseContent;
  const exercise: Exercise = { id: row.id, lessonId: row.lesson_id, track: null, type: row.type, content };
  return {
    id: row.id,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    track: row.track,
    level: row.level,
    type: row.type,
    content,
    correctAnswer: correctAnswerFor(exercise),
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export function createPracticeAdminService(db: Database.Database, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());

  function getRow(id: string): ItemRow {
    const row = db.prepare(`${SELECT_ITEMS} WHERE p.id = ?`).get(id) as ItemRow | undefined;
    if (!row) throw new PracticeAdminError(`Practice exercise not found: ${id}`, 'not_found');
    return row;
  }

  function list(
    filter: { status?: PracticeReviewStatus; track?: Track; level?: CefrLevel; lessonId?: string } = {}
  ): PracticePoolItem[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.status) (where.push('p.review_status = ?'), args.push(filter.status));
    if (filter.track) (where.push('l.track = ?'), args.push(filter.track));
    if (filter.level) (where.push('l.source_level = ?'), args.push(filter.level));
    if (filter.lessonId) (where.push('p.lesson_id = ?'), args.push(filter.lessonId));
    const sql = `${SELECT_ITEMS}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at, p.rowid`;
    return (db.prepare(sql).all(...args) as ItemRow[]).map(rowToItem);
  }

  function setStatus(id: string, status: 'approved' | 'rejected'): PracticePoolItem {
    getRow(id);
    db.prepare('UPDATE practice_exercises SET review_status = ?, reviewed_at = ? WHERE id = ?').run(status, now().toISOString(), id);
    return rowToItem(getRow(id));
  }

  // Spec: Admin, "Edit" — same type, validated like the admin editor, and marked approved.
  function editContent(id: string, content: unknown): PracticePoolItem {
    const row = getRow(id);
    if (hasInstructionKey(content)) {
      throw new PracticeAdminError('Practice exercises are German-only and cannot have an instruction', 'bad_request');
    }
    const errors = validateExerciseContent(row.type, content);
    if (errors.length > 0) throw new PracticeAdminError(`Invalid content: ${errors.join('; ')}`, 'bad_request');
    db.prepare("UPDATE practice_exercises SET content = ?, review_status = 'approved', reviewed_at = ? WHERE id = ?").run(
      JSON.stringify(content),
      now().toISOString(),
      id
    );
    return rowToItem(getRow(id));
  }

  // Spec: Admin, "Promote" — becomes an authored exercise of its lesson and leaves the pool. The
  // flashcard rule applies; a completed lesson stays complete (Phase 1: completion is sticky).
  function promote(id: string): { exerciseId: string } {
    return db.transaction(() => {
      const row = getRow(id);
      const violation = flashcardRuleViolation(row.skill, [{ type: row.type }]);
      if (violation) throw new PracticeAdminError(violation, 'bad_request');
      const exerciseId = `${row.lesson_id}__ex-${randomSuffix()}`;
      db.prepare('INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, NULL, ?, ?)').run(
        exerciseId,
        row.lesson_id,
        row.type,
        row.content
      );
      db.prepare('DELETE FROM practice_exercises WHERE id = ?').run(id);
      return { exerciseId };
    })();
  }

  return { list, setStatus, editContent, promote };
}

export type PracticeAdminService = ReturnType<typeof createPracticeAdminService>;
