import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';
import type { LocalizedText } from '../i18n/localizedText';
import type { GradeResult } from './grading';
import type { PassageQuestionsAnswer, PassageQuestionsContent } from '../tasks/passageQuestions';
import type { MatchingAnswer, MatchingContent } from '../tasks/matching';
import type { ClozeAnswer, ClozeContent } from '../tasks/cloze';
import type { AudioQuestionsAnswer } from '../tasks/audioQuestions';
import { correctTexts, type TaskContent } from '../tasks/taskTypes';

export type FlashcardRating = 'knew' | 'sort_of' | 'didnt_know';
export type AttemptSource = 'lesson' | 'queue';

export type LessonAnswer =
  | { type: 'multiple_choice'; selectedIndex: number }
  | { type: 'fill_blank'; text: string }
  | { type: 'flashcard'; rating: FlashcardRating }
  | { type: 'free_text'; text: string }
  | PassageQuestionsAnswer
  | MatchingAnswer
  | ClozeAnswer;

// What the student gets back after answering an exercise.
export interface AttemptOutcome {
  result: GradeResult;
  correctAnswer: string | null;
  feedback: LocalizedText | null;
  passedExerciseIds: string[];
  lessonCompleted: boolean;
  justCompleted: boolean;
  // S17: one entry per question, text or gap, for the reading task types only.
  itemResults?: boolean[];
}

const FLASHCARD_RATINGS: readonly FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

// Spec: Grades — "Knew it" / "Sort of" / "Didn't know it".
export const FLASHCARD_GRADES: Record<FlashcardRating, GradeResult> = {
  knew: 'correct',
  sort_of: 'almost',
  didnt_know: 'wrong',
};

export function parseLessonAnswer(raw: unknown): LessonAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'multiple_choice' && typeof a.selectedIndex === 'number' && Number.isInteger(a.selectedIndex)) {
    return { type: 'multiple_choice', selectedIndex: a.selectedIndex };
  }
  if (a.type === 'fill_blank' && typeof a.text === 'string') return { type: 'fill_blank', text: a.text };
  if (a.type === 'flashcard' && typeof a.rating === 'string' && (FLASHCARD_RATINGS as readonly string[]).includes(a.rating)) {
    return { type: 'flashcard', rating: a.rating as FlashcardRating };
  }
  if (a.type === 'free_text' && typeof a.text === 'string') return { type: 'free_text', text: a.text };
  // The reading task types are checked against their content when graded (parseTaskAnswer).
  if ((a.type === 'passage_questions' || a.type === 'matching') && Array.isArray(a.selected)) {
    return { type: a.type, selected: a.selected as (number | null)[] };
  }
  if (a.type === 'cloze' && Array.isArray(a.values)) return { type: 'cloze', values: a.values as (string | number | null)[] };
  return null;
}

export function isAttemptSource(value: unknown): value is AttemptSource {
  return value === 'lesson' || value === 'queue';
}

// Shown after answering: the right option or text, or the model answer for free text.
export function correctAnswerFor(exercise: Exercise): string | null {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return content.options[content.correctIndex] ?? null;
    }
    case 'fill_blank':
      return (exercise.content as FillBlankContent).correctAnswer;
    case 'free_text':
      return (exercise.content as FreeTextContent).modelAnswer;
    case 'flashcard':
      return null;
    case 'passage_questions':
    case 'matching':
    case 'cloze':
      return correctTexts(exercise.type, exercise.content as TaskContent).join('; ');
  }
}

const UNANSWERED = '—';

// The parts of a reading task the answer text needs. The student's view carries all of them, so the
// card (client) and the attempt log (server) share this function and write the same text.
export type TaskAnswerSource =
  | { type: 'passage_questions'; questions: { options: string[] }[] }
  | { type: 'audio_questions'; questions: { options: string[] }[] }
  | { type: 'matching'; targets: string[] }
  | { type: 'cloze'; gaps: ({ mode: 'typed' } | { mode: 'select'; options: string[] } | { mode: 'bank' })[]; bank?: string[] };

// One readable entry per question, text or gap, joined with '; ': the chosen option or text,
// "x" for "none fits", "—" when unanswered.
export function taskAnswerText(source: TaskAnswerSource, answer: PassageQuestionsAnswer | MatchingAnswer | ClozeAnswer | AudioQuestionsAnswer): string {
  let parts: string[] = [];
  if ((answer.type === 'passage_questions' && source.type === 'passage_questions') || (answer.type === 'audio_questions' && source.type === 'audio_questions')) {
    parts = answer.selected.map((s, i) => (s === null ? UNANSWERED : (source.questions[i]?.options[s] ?? UNANSWERED)));
  } else if (answer.type === 'matching' && source.type === 'matching') {
    parts = answer.selected.map((s) => (s === null ? 'x' : (source.targets[s] ?? UNANSWERED)));
  } else if (answer.type === 'cloze' && source.type === 'cloze') {
    parts = answer.values.map((v, i) => {
      const gap = source.gaps[i];
      if (v === null || !gap) return UNANSWERED;
      if (typeof v === 'string') return v.trim() || UNANSWERED;
      const picked = gap.mode === 'select' ? gap.options[v] : gap.mode === 'bank' ? source.bank?.[v] : undefined;
      return picked ?? UNANSWERED;
    });
  }
  return parts.join('; ');
}

function taskAnswerSourceOf(exercise: Exercise): TaskAnswerSource {
  switch (exercise.type) {
    case 'passage_questions':
      return { type: 'passage_questions', ...(exercise.content as PassageQuestionsContent) };
    case 'matching':
      return { type: 'matching', ...(exercise.content as MatchingContent) };
    default:
      return { type: 'cloze', ...(exercise.content as ClozeContent) };
  }
}

// The student's answer as text, for the attempt log and the lesson chat's context.
export function answerTextFor(exercise: Exercise, answer: LessonAnswer): string {
  switch (answer.type) {
    case 'multiple_choice':
      return (exercise.content as MultipleChoiceContent).options[answer.selectedIndex] ?? '';
    case 'fill_blank':
    case 'free_text':
      return answer.text;
    case 'flashcard':
      return answer.rating;
    case 'passage_questions':
    case 'matching':
    case 'cloze':
      return taskAnswerText(taskAnswerSourceOf(exercise), answer);
  }
}

// S5: "Ask AI" needs the whole stimulus, capped so a long passage can't swamp the prompt.
const TASK_TEXT_CAP = 4000;

function capped(text: string): string {
  return text.length > TASK_TEXT_CAP ? `${text.slice(0, TASK_TEXT_CAP)}…` : text;
}

function setTaskText(exercise: Exercise): string {
  switch (exercise.type) {
    case 'passage_questions': {
      const { passage, questions } = exercise.content as PassageQuestionsContent;
      const list = questions.map((q, i) => `${i + 1}. ${q.question} (options: ${q.options.join(' | ')})`);
      return `${passage}\n\n${list.join('\n')}`;
    }
    case 'matching': {
      const { items, targets, allowNone } = exercise.content as MatchingContent;
      const letter = (i: number) => String.fromCharCode(97 + (i % 26));
      const options = targets.map((t, i) => `${letter(i)}) ${t}`);
      if (allowNone) options.push('x) none fits');
      return `Texts:\n${items.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nOptions:\n${options.join('\n')}`;
    }
    default: {
      const { text, gaps, bank } = exercise.content as ClozeContent;
      const lines = gaps.flatMap((g, i) => (g.mode === 'select' ? [`Gap ${i + 1} options: ${g.options.join(' | ')}`] : []));
      if (bank && bank.length > 0) lines.push(`Word bank: ${bank.join(' | ')}`);
      return lines.length > 0 ? `${text}\n\n${lines.join('\n')}` : text;
    }
  }
}

// The task as text, for the lesson chat's context.
export function taskTextFor(exercise: Exercise): string {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return `${content.question} (options: ${content.options.join(' | ')})`;
    }
    case 'fill_blank':
      return (exercise.content as FillBlankContent).textWithBlank;
    case 'flashcard':
      return (exercise.content as FlashcardContent).front;
    case 'free_text':
      return (exercise.content as FreeTextContent).prompt;
    case 'passage_questions':
    case 'matching':
    case 'cloze':
      return capped(setTaskText(exercise));
  }
}

// The English task text for AI prompts: the instruction (if any) followed by the stimulus.
export function taskTextOf(exercise: Exercise): string {
  const content = exercise.content as { instruction?: { en: string } };
  const stimulus = taskTextFor(exercise);
  return [content.instruction?.en, stimulus].filter((part) => part && part.trim()).join(' — ');
}
