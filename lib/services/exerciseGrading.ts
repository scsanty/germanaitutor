import type { LocalizedText } from '../i18n/localizedText';
import type { CefrLevel } from '../types';
import type { Exercise, FillBlankContent, FreeTextContent, MultipleChoiceContent } from '../curriculum/types';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import type { FreeTextGradingInput, FreeTextMistake } from '../tutoring/freeTextGrading';
import { gradeFillBlank, gradeMultipleChoice, type GradeResult } from '../tutoring/grading';
import { FLASHCARD_GRADES, taskTextOf, type LessonAnswer } from '../tutoring/lessonAnswers';
import type { FreeTextGradeOutcome } from './freeTextGradingService';
import { gradeTask, parseTaskAnswer, resultFromItems, type TaskContent } from '../tasks/taskTypes';
import { parseLetterAnswer, type LetterAnswer, type LetterContent } from '../tasks/letter';
import { resultFromPercent, type LetterGrade } from '../writing/letterGrading';
import type { LetterGradeOutcome } from './letterGradingService';

export type ExerciseGradeOutcome =
  // itemResults only for the reading and listening task types (S17): one entry per question, text or gap.
  // mistakes only for free text: the caller logs them for lesson content (S7). letter only for letters,
  // whose marks the letter grader has already logged.
  | {
      ok: true;
      result: GradeResult;
      feedback: LocalizedText | null;
      itemResults?: boolean[];
      mistakes?: FreeTextMistake[];
      letter?: LetterGrade;
    }
  | { ok: false; reason: 'bad_request'; message: string }
  | { ok: false; reason: 'grading_failed'; message: string; code?: ErrorCode; params?: ErrorParams };

// What a lesson letter grader gets; the caller knows the lesson's track (S6).
export interface ExerciseLetterInput {
  level: CefrLevel;
  content: LetterContent;
  answer: LetterAnswer;
}

export interface ExerciseGradingDeps {
  gradeFreeText: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  // Only lessons grade letters. Without it (practice, test-out) a letter answer is a bad request.
  gradeLetter?: (input: ExerciseLetterInput) => Promise<LetterGradeOutcome>;
}

// The one grading rule for authored and practice exercises (spec: Grades): deterministic for
// multiple choice, fill-in-the-blank and the reading task types (item by item), the student's own rating for flashcards,
// the AI for free text and letters.
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
        prompt: taskTextOf(exercise),
        modelAnswer: content.modelAnswer,
        studentAnswer: answer.text,
        level,
      });
      if (!graded.ok) {
        return { ok: false, reason: 'grading_failed', message: graded.error, code: graded.code, params: graded.params };
      }
      return { ok: true, result: graded.result, feedback: graded.feedback, mistakes: graded.mistakes ?? [] };
    }
    case 'letter': {
      // Review Focus 4: an empty letter is refused before any AI call.
      if (!answer.text.trim()) return { ok: false, reason: 'bad_request', message: 'Write your letter first' };
      const content = exercise.content as LetterContent;
      const parsed = parseLetterAnswer(answer, content);
      if (!parsed) return { ok: false, reason: 'bad_request', message: 'The answer does not fit this task' };
      if (!deps.gradeLetter) return { ok: false, reason: 'bad_request', message: 'Letters are graded in lessons only' };
      const graded = await deps.gradeLetter({ level, content, answer: parsed });
      if (!graded.ok) {
        if (graded.code === 'bad_request') return { ok: false, reason: 'bad_request', message: graded.error };
        return { ok: false, reason: 'grading_failed', message: graded.error, code: graded.code, params: graded.params };
      }
      // Spec: Lessons — correct at >= 60% of the rubric points, almost at >= 40%.
      return { ok: true, result: resultFromPercent(graded.grade.percent), feedback: graded.grade.summary, letter: graded.grade };
    }
    case 'passage_questions':
    case 'matching':
    case 'cloze':
    case 'audio_questions': {
      const content = exercise.content as TaskContent;
      const parsed = parseTaskAnswer(answer.type, answer, content);
      if (!parsed) return { ok: false, reason: 'bad_request', message: 'The answer does not fit this task' };
      const { itemResults } = gradeTask(answer.type, content, parsed);
      return { ok: true, result: resultFromItems(itemResults), feedback: null, itemResults };
    }
  }
}
