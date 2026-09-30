import type { ExerciseType, Skill } from '../curriculum/types';

export const PRACTICE_BATCH_SIZE = 5;

const TYPE_ORDER: readonly ExerciseType[] = ['multiple_choice', 'fill_blank', 'flashcard', 'free_text'];

// Practice mirrors the lesson's own exercise types; flashcards only ever in vocabulary lessons
// (Phase 1 rule). A lesson with nothing usable authored falls back to the two deterministic types.
export function allowedPracticeTypes(skill: Skill, authoredTypes: readonly ExerciseType[]): ExerciseType[] {
  const fromLesson = TYPE_ORDER.filter(
    (type) => authoredTypes.includes(type) && (type !== 'flashcard' || skill === 'vocabulary')
  );
  if (fromLesson.length > 0) return fromLesson;
  return skill === 'vocabulary' ? ['multiple_choice', 'fill_blank', 'flashcard'] : ['multiple_choice', 'fill_blank'];
}
