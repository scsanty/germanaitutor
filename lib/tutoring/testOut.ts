import type { ExerciseType } from '../curriculum/types';
import type { GradeResult } from './grading';

// Spec: Test-out.
export const TESTOUT_PASS_RATIO = 0.8;
export const TESTOUT_PER_LESSON = 2;
export const TESTOUT_MAX_QUESTIONS = 20;
export const TESTOUT_MIN_QUESTIONS = 5;
export const TESTOUT_COOLDOWN_HOURS = 24;

// Types added later declare their own eligibility here (letter tasks and spoken answers won't be).
export function isTestOutEligibleType(type: ExerciseType, aiAvailable: boolean): boolean {
  if (type === 'multiple_choice' || type === 'fill_blank') return true;
  if (type === 'free_text') return aiAvailable;
  return false;
}

export interface TestOutCandidate {
  lessonId: string;
  // the lesson's eligible exercises
  exerciseIds: string[];
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function drawTestOut(candidates: TestOutCandidate[], random: () => number = Math.random): string[] {
  const lessons = shuffled(
    candidates.filter((c) => c.exerciseIds.length > 0),
    random
  ).map((c) => ({ lessonId: c.lessonId, pool: shuffled(c.exerciseIds, random) }));

  if (lessons.length <= TESTOUT_MAX_QUESTIONS / TESTOUT_PER_LESSON) {
    return lessons.flatMap((l) => l.pool.slice(0, TESTOUT_PER_LESSON));
  }
  if (lessons.length > TESTOUT_MAX_QUESTIONS) {
    return lessons.slice(0, TESTOUT_MAX_QUESTIONS).map((l) => l.pool[0]);
  }
  const drawn = lessons.map((l) => l.pool[0]);
  for (const lesson of shuffled(lessons, random)) {
    if (drawn.length >= TESTOUT_MAX_QUESTIONS) break;
    if (lesson.pool.length > 1) drawn.push(lesson.pool[1]);
  }
  return drawn;
}

const POINTS: Record<GradeResult, number> = { correct: 1, almost: 0.5, wrong: 0 };

export function scoreTestOut(results: GradeResult[]): { score: number; maxScore: number; passed: boolean } {
  const score = results.reduce((sum, r) => sum + POINTS[r], 0);
  const maxScore = results.length;
  return { score, maxScore, passed: maxScore > 0 && score / maxScore >= TESTOUT_PASS_RATIO };
}

export function cooldownEndsAt(finishedAt: string): string {
  return new Date(new Date(finishedAt).getTime() + TESTOUT_COOLDOWN_HOURS * 3_600_000).toISOString();
}
