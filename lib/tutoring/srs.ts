import type { GradeResult } from './grading';
import { addDays } from './dates';

export interface SrsState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextDueAt: string; // local calendar date, YYYY-MM-DD
}

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;

const EASE_CHANGE: Record<GradeResult, number> = { correct: 0.1, almost: -0.15, wrong: -0.2 };

function roundEase(value: number): number {
  return Math.round(value * 100) / 100;
}

// Simplified SM-2 (spec: Spaced Repetition). Written against a plain state object, not a
// table, so Phase 3's vocabulary deck can reuse it unchanged.
export function computeNextReview(state: SrsState, result: GradeResult, today: string): SrsState {
  const easeFactor = Math.max(MIN_EASE, roundEase(state.easeFactor + EASE_CHANGE[result]));
  if (result === 'wrong') {
    return { repetitions: 0, easeFactor, intervalDays: 1, nextDueAt: addDays(today, 1) };
  }
  const repetitions = state.repetitions + 1;
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(state.intervalDays * easeFactor));
  return { repetitions, easeFactor, intervalDays, nextDueAt: addDays(today, intervalDays) };
}

// Entering review when a lesson completes, from the exercise's first-ever attempt:
// correct on the first try → in 3 days; anything else → tomorrow.
export function seedReview(firstAttempt: GradeResult, today: string): SrsState {
  return firstAttempt === 'correct'
    ? { repetitions: 1, easeFactor: INITIAL_EASE, intervalDays: 3, nextDueAt: addDays(today, 3) }
    : { repetitions: 0, easeFactor: INITIAL_EASE, intervalDays: 1, nextDueAt: addDays(today, 1) };
}
