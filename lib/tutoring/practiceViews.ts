import type { ExerciseView } from './exerciseView';
import type { GradeResult } from './grading';

// What `POST /api/tutoring/lessons/[id]/practice` returns: never the answers.
export interface PracticeBatch {
  exercises: ExerciseView[];
}

// What `POST /api/tutoring/practice/answer` returns. Nothing is stored.
export interface PracticeGradeOutcome {
  result: GradeResult;
  correctAnswer: string | null;
  // S17: per question, text or gap, for the reading task types only.
  itemResults?: boolean[];
}
