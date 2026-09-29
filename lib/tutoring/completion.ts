import type { GradeResult } from './grading';

export type LessonStatus = 'not_started' | 'in_progress' | 'complete' | 'covered';

// `almost` counts as passed for completion (spec: Grades).
export function isPassing(result: GradeResult): boolean {
  return result !== 'wrong';
}

// A lesson completes the first time every exercise has a passing attempt. A lesson with no
// exercises completes only through "Mark as done", never through this rule.
export function meetsCompletionRule(exerciseIds: string[], passedExerciseIds: ReadonlySet<string>): boolean {
  return exerciseIds.length > 0 && exerciseIds.every((id) => passedExerciseIds.has(id));
}

// Own completion wins over shared completion ("covered via another track"), which wins over
// having started.
export function lessonStatus(input: { completed: boolean; covered: boolean; attempted: boolean }): LessonStatus {
  if (input.completed) return 'complete';
  if (input.covered) return 'covered';
  return input.attempted ? 'in_progress' : 'not_started';
}
