import type { CefrLevel } from '../types';
import type { GradeResult } from './grading';
import { LEVELS } from './levels';

export const LEVEL_POINTS: Record<CefrLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
export const PASS_SHARE = 0.75;
export const MAX_MISTAKES = 5;

export type PlacementStopReason = 'beyond_my_knowledge' | 'five_mistakes' | 'finished';

export function pointsFor(level: CefrLevel, result: GradeResult): number {
  if (result === 'correct') return LEVEL_POINTS[level];
  if (result === 'almost') return LEVEL_POINTS[level] / 2;
  return 0;
}

export function maxScore(questions: { level: CefrLevel }[]): number {
  return questions.reduce((sum, q) => sum + LEVEL_POINTS[q.level], 0);
}

// Placed at a level = shown PASS_SHARE of the points of every level below it.
export function placementThresholds(questions: { level: CefrLevel }[]): Record<CefrLevel, number> {
  const maxByLevel = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 } as Record<CefrLevel, number>;
  for (const q of questions) maxByLevel[q.level] += LEVEL_POINTS[q.level];
  const thresholds = {} as Record<CefrLevel, number>;
  let cumulative = 0;
  for (const level of LEVELS) {
    thresholds[level] = cumulative;
    cumulative += PASS_SHARE * maxByLevel[level];
  }
  return thresholds;
}

export function placedLevel(score: number, questions: { level: CefrLevel }[]): CefrLevel {
  const thresholds = placementThresholds(questions);
  let placed: CefrLevel = 'A1';
  for (const level of LEVELS) {
    if (score >= thresholds[level]) placed = level;
  }
  return placed;
}

export function stopReasonAfterAnswer(
  mistakes: number,
  answeredCount: number,
  totalQuestions: number
): 'five_mistakes' | 'finished' | null {
  if (mistakes >= MAX_MISTAKES) return 'five_mistakes';
  if (answeredCount >= totalQuestions) return 'finished';
  return null;
}
