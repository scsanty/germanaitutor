import type { MultipleChoiceContent, FillBlankContent } from '../curriculum/types';

export type GradeResult = 'correct' | 'almost' | 'wrong';

export function gradeMultipleChoice(content: MultipleChoiceContent, selectedIndex: number): GradeResult {
  return selectedIndex === content.correctIndex ? 'correct' : 'wrong';
}

function normalize(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function gradeFillBlank(content: FillBlankContent, answer: string): GradeResult {
  const given = normalize(answer);
  const accepted = [content.correctAnswer, ...(content.acceptableVariants ?? [])].map(normalize);
  return given !== '' && accepted.includes(given) ? 'correct' : 'wrong';
}
