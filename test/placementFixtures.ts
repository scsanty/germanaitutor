import { LEVELS } from '@/lib/tutoring/levels';
import type { PlacementQuestion } from '@/lib/tutoring/placementExamFormat';
import type { PlacementAnswer } from '@/lib/tutoring/placementTypes';

// One multiple choice and one fill-blank per level: 10 questions, max score 30,
// thresholds A2 1.5, B1 4.5, B2 9, C1 15.
export function smallPlacementExam(): PlacementQuestion[] {
  return LEVELS.flatMap((level): PlacementQuestion[] => [
    { id: `${level}-mc`, level, type: 'multiple_choice', content: { question: `${level} question`, options: ['right', 'wrong'], correctIndex: 0 } },
    { id: `${level}-fill`, level, type: 'fill_blank', content: { textWithBlank: `${level} ___`, correctAnswer: 'ja' } },
  ]);
}

export function rightAnswer(question: PlacementQuestion): PlacementAnswer {
  if (question.type === 'multiple_choice') return { type: 'multiple_choice', selectedIndex: question.content.correctIndex };
  if (question.type === 'fill_blank') return { type: 'fill_blank', text: question.content.correctAnswer };
  return { type: 'free_text', text: question.content.modelAnswer };
}

export function wrongAnswer(question: PlacementQuestion): PlacementAnswer {
  if (question.type === 'multiple_choice') {
    return { type: 'multiple_choice', selectedIndex: question.content.correctIndex === 0 ? 1 : 0 };
  }
  if (question.type === 'fill_blank') return { type: 'fill_blank', text: 'definitely wrong' };
  return { type: 'free_text', text: 'definitely wrong' };
}
