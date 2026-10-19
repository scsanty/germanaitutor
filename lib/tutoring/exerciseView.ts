import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';
import type { LocalizedText } from '../i18n/localizedText';
import type { PassageQuestionsView } from '../tasks/passageQuestions';
import type { MatchingView } from '../tasks/matching';
import type { ClozeView } from '../tasks/cloze';
import type { AudioQuestionsView } from '../tasks/audioQuestions';
import { viewLetter, type LetterContent, type LetterView } from '../tasks/letter';
import { viewTask, type TaskContent } from '../tasks/taskTypes';

// What the student sees of an exercise before answering: never the answer. A flashcard keeps
// its back, since the student reveals it and grades themselves.
export type ExerciseView =
  | { id: string; type: 'multiple_choice'; question: string; options: string[]; instruction?: LocalizedText }
  | { id: string; type: 'fill_blank'; textWithBlank: string; instruction?: LocalizedText }
  | { id: string; type: 'flashcard'; front: string; back: string }
  | { id: string; type: 'free_text'; prompt: string; instruction?: LocalizedText }
  | ({ id: string; type: 'passage_questions' } & PassageQuestionsView)
  | ({ id: string; type: 'matching' } & MatchingView)
  | ({ id: string; type: 'cloze' } & ClozeView)
  | ({ id: string; type: 'audio_questions' } & AudioQuestionsView)
  // Writing: nothing in a letter task is secret, so the view is the content.
  | ({ id: string; type: 'letter' } & LetterView);

function instructionOf(content: { instruction?: LocalizedText }): { instruction?: LocalizedText } {
  return content.instruction ? { instruction: content.instruction } : {};
}

// `playable(hash)`: whether a listening exercise's audio can be played now (cached, or the speech
// service is up to render it on demand). S9: every caller passes its request's availability.
export function toExerciseView(exercise: Exercise, playable: (hash: string) => boolean = () => false): ExerciseView {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return {
        id: exercise.id,
        type: 'multiple_choice',
        question: content.question,
        options: content.options,
        ...instructionOf(content),
      };
    }
    case 'fill_blank': {
      const content = exercise.content as FillBlankContent;
      return { id: exercise.id, type: 'fill_blank', textWithBlank: content.textWithBlank, ...instructionOf(content) };
    }
    case 'flashcard': {
      const content = exercise.content as FlashcardContent;
      return { id: exercise.id, type: 'flashcard', front: content.front, back: content.back };
    }
    case 'free_text': {
      const content = exercise.content as FreeTextContent;
      return { id: exercise.id, type: 'free_text', prompt: content.prompt, ...instructionOf(content) };
    }
    case 'passage_questions':
      return { id: exercise.id, type: 'passage_questions', ...(viewTask('passage_questions', exercise.content as TaskContent) as PassageQuestionsView) };
    case 'matching':
      return { id: exercise.id, type: 'matching', ...(viewTask('matching', exercise.content as TaskContent) as MatchingView) };
    case 'cloze':
      return { id: exercise.id, type: 'cloze', ...(viewTask('cloze', exercise.content as TaskContent) as ClozeView) };
    case 'audio_questions':
      return {
        id: exercise.id,
        type: 'audio_questions',
        ...(viewTask('audio_questions', exercise.content as TaskContent, playable) as AudioQuestionsView),
      };
    case 'letter':
      return { id: exercise.id, type: 'letter', ...viewLetter(exercise.content as LetterContent) };
  }
}
