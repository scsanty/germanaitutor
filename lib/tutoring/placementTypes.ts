import type { CefrLevel } from '../types';
import type { GradeResult } from './grading';
import type { PlacementQuestionType } from './placementExamFormat';
import type { PlacementStopReason } from './placementScoring';

export type PlacementAnswer =
  | { type: 'multiple_choice'; selectedIndex: number }
  | { type: 'fill_blank'; text: string }
  | { type: 'free_text'; text: string };

interface QuestionViewBase {
  id: string;
  position: number;
  total: number;
  level: CefrLevel;
}

// What the client sees of a question: never the answer.
export type PlacementQuestionView =
  | (QuestionViewBase & { type: 'multiple_choice'; question: string; options: string[] })
  | (QuestionViewBase & { type: 'fill_blank'; textWithBlank: string })
  | (QuestionViewBase & { type: 'free_text'; prompt: string });

export interface PlacementAnswerRecord {
  questionId: string;
  level: CefrLevel;
  type: PlacementQuestionType;
  question: string;
  given: string;
  correctAnswer: string;
  result: GradeResult;
  feedback: string | null;
}

export interface PlacementOutcome {
  score: number;
  maxScore: number;
  placedLevel: CefrLevel;
  stopReason: PlacementStopReason;
  answers: PlacementAnswerRecord[];
  isNewBest: boolean;
}

export type PlacementState =
  | { status: 'in_progress'; question: PlacementQuestionView }
  | { status: 'finished'; outcome: PlacementOutcome };

export interface PlacementBestResult {
  score: number;
  maxScore: number;
  placedLevel: CefrLevel;
  stopReason: PlacementStopReason;
  takenAt: string;
}

export function parsePlacementAnswer(raw: unknown): PlacementAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'multiple_choice' && typeof a.selectedIndex === 'number' && Number.isInteger(a.selectedIndex)) {
    return { type: 'multiple_choice', selectedIndex: a.selectedIndex };
  }
  if (a.type === 'fill_blank' && typeof a.text === 'string') return { type: 'fill_blank', text: a.text };
  if (a.type === 'free_text' && typeof a.text === 'string') return { type: 'free_text', text: a.text };
  return null;
}
