import type { GradeResult } from '../tutoring/grading';
import * as pq from './passageQuestions';
import * as mt from './matching';
import * as cz from './cloze';

export type SetTaskType = 'passage_questions' | 'matching' | 'cloze';
export type TaskContent = pq.PassageQuestionsContent | mt.MatchingContent | cz.ClozeContent;
export type TaskView = pq.PassageQuestionsView | mt.MatchingView | cz.ClozeView;
export type TaskAnswer = pq.PassageQuestionsAnswer | mt.MatchingAnswer | cz.ClozeAnswer;

export function isSetTaskType(v: unknown): v is SetTaskType {
  return v === 'passage_questions' || v === 'matching' || v === 'cloze';
}

export function validateTask(type: SetTaskType, content: unknown): string[] {
  return type === 'passage_questions' ? pq.validatePassageQuestions(content) : type === 'matching' ? mt.validateMatching(content) : cz.validateCloze(content);
}

export function viewTask(type: SetTaskType, content: TaskContent): TaskView {
  return type === 'passage_questions'
    ? pq.viewPassageQuestions(content as pq.PassageQuestionsContent)
    : type === 'matching'
      ? mt.viewMatching(content as mt.MatchingContent)
      : cz.viewCloze(content as cz.ClozeContent);
}

export function parseTaskAnswer(type: SetTaskType, raw: unknown, content: TaskContent): TaskAnswer | null {
  return type === 'passage_questions'
    ? pq.parsePassageQuestionsAnswer(raw, content as pq.PassageQuestionsContent)
    : type === 'matching'
      ? mt.parseMatchingAnswer(raw, content as mt.MatchingContent)
      : cz.parseClozeAnswer(raw, content as cz.ClozeContent);
}

export function gradeTask(type: SetTaskType, content: TaskContent, answer: TaskAnswer): { itemResults: boolean[] } {
  return type === 'passage_questions'
    ? pq.gradePassageQuestions(content as pq.PassageQuestionsContent, answer as pq.PassageQuestionsAnswer)
    : type === 'matching'
      ? mt.gradeMatching(content as mt.MatchingContent, answer as mt.MatchingAnswer)
      : cz.gradeCloze(content as cz.ClozeContent, answer as cz.ClozeAnswer);
}

export function correctTexts(type: SetTaskType, content: TaskContent): string[] {
  return type === 'passage_questions'
    ? pq.correctTextPassageQuestions(content as pq.PassageQuestionsContent)
    : type === 'matching'
      ? mt.correctTextMatching(content as mt.MatchingContent)
      : cz.correctTextCloze(content as cz.ClozeContent);
}

export function resultFromItems(itemResults: boolean[]): GradeResult {
  const ratio = itemResults.length === 0 ? 0 : itemResults.filter(Boolean).length / itemResults.length;
  return ratio >= 0.8 ? 'correct' : ratio >= 0.5 ? 'almost' : 'wrong';
}

export function itemCount(type: SetTaskType, content: TaskContent): number {
  return type === 'passage_questions'
    ? (content as pq.PassageQuestionsContent).questions.length
    : type === 'matching'
      ? (content as mt.MatchingContent).items.length
      : (content as cz.ClozeContent).gaps.length;
}
