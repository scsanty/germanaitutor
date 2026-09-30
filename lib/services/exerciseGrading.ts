import type { CefrLevel } from '../types';
import type { Exercise, FillBlankContent, FreeTextContent, MultipleChoiceContent } from '../curriculum/types';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { gradeFillBlank, gradeMultipleChoice, type GradeResult } from '../tutoring/grading';
import { FLASHCARD_GRADES, type LessonAnswer } from '../tutoring/lessonAnswers';
import type { FreeTextGradeOutcome } from './freeTextGradingService';

export type ExerciseGradeOutcome =
  | { ok: true; result: GradeResult; feedback: string | null }
  | { ok: false; reason: 'bad_request'; message: string }
  | { ok: false; reason: 'grading_failed'; message: string; code?: ErrorCode; params?: ErrorParams };

export interface ExerciseGradingDeps {
  gradeFreeText: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  uiLanguage: 'en' | 'de';
}

// The one grading rule for authored and practice exercises (spec: Grades): deterministic for
// multiple choice and fill-in-the-blank, the student's own rating for flashcards, the AI for free text.
export async function gradeExerciseAnswer(
  exercise: Exercise,
  answer: LessonAnswer,
  level: CefrLevel,
  deps: ExerciseGradingDeps
): Promise<ExerciseGradeOutcome> {
  if (answer.type !== exercise.type) {
    return { ok: false, reason: 'bad_request', message: 'The answer does not match the exercise type' };
  }
  switch (answer.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      if (answer.selectedIndex < 0 || answer.selectedIndex >= content.options.length) {
        return { ok: false, reason: 'bad_request', message: 'That option does not exist' };
      }
      return { ok: true, result: gradeMultipleChoice(content, answer.selectedIndex), feedback: null };
    }
    case 'fill_blank':
      return { ok: true, result: gradeFillBlank(exercise.content as FillBlankContent, answer.text), feedback: null };
    case 'flashcard':
      return { ok: true, result: FLASHCARD_GRADES[answer.rating], feedback: null };
    case 'free_text': {
      if (!answer.text.trim()) return { ok: false, reason: 'bad_request', message: 'Write an answer first' };
      const content = exercise.content as FreeTextContent;
      const graded = await deps.gradeFreeText({
        prompt: content.prompt,
        modelAnswer: content.modelAnswer,
        studentAnswer: answer.text,
        level,
        uiLanguage: deps.uiLanguage,
      });
      if (!graded.ok) {
        return { ok: false, reason: 'grading_failed', message: graded.error, code: graded.code, params: graded.params };
      }
      return { ok: true, result: graded.result, feedback: graded.feedback };
    }
  }
}
