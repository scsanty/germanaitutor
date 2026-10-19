import type { GradeResult } from '../tutoring/grading';
import * as pq from './passageQuestions';
import * as mt from './matching';
import * as cz from './cloze';
import * as aq from './audioQuestions';

export type SetTaskType = 'passage_questions' | 'matching' | 'cloze' | 'audio_questions';
export type TaskContent = pq.PassageQuestionsContent | mt.MatchingContent | cz.ClozeContent | aq.AudioQuestionsContent;
export type TaskView = pq.PassageQuestionsView | mt.MatchingView | cz.ClozeView | aq.AudioQuestionsView;
export type TaskAnswer = pq.PassageQuestionsAnswer | mt.MatchingAnswer | cz.ClozeAnswer | aq.AudioQuestionsAnswer;

export function isSetTaskType(v: unknown): v is SetTaskType {
  return v === 'passage_questions' || v === 'matching' || v === 'cloze' || v === 'audio_questions';
}

export function validateTask(type: SetTaskType, content: unknown): string[] {
  switch (type) {
    case 'passage_questions':
      return pq.validatePassageQuestions(content);
    case 'matching':
      return mt.validateMatching(content);
    case 'cloze':
      return cz.validateCloze(content);
    case 'audio_questions':
      return aq.validateAudioQuestions(content);
  }
}

// `available(hash)` says whether a clip is cached; only audio_questions uses it.
export function viewTask(type: SetTaskType, content: TaskContent, available: (hash: string) => boolean = () => false): TaskView {
  switch (type) {
    case 'passage_questions':
      return pq.viewPassageQuestions(content as pq.PassageQuestionsContent);
    case 'matching':
      return mt.viewMatching(content as mt.MatchingContent);
    case 'cloze':
      return cz.viewCloze(content as cz.ClozeContent);
    case 'audio_questions':
      return aq.viewAudioQuestions(content as aq.AudioQuestionsContent, available);
  }
}

export function parseTaskAnswer(type: SetTaskType, raw: unknown, content: TaskContent): TaskAnswer | null {
  switch (type) {
    case 'passage_questions':
      return pq.parsePassageQuestionsAnswer(raw, content as pq.PassageQuestionsContent);
    case 'matching':
      return mt.parseMatchingAnswer(raw, content as mt.MatchingContent);
    case 'cloze':
      return cz.parseClozeAnswer(raw, content as cz.ClozeContent);
    case 'audio_questions':
      return aq.parseAudioQuestionsAnswer(raw, content as aq.AudioQuestionsContent);
  }
}

export function gradeTask(type: SetTaskType, content: TaskContent, answer: TaskAnswer): { itemResults: boolean[] } {
  switch (type) {
    case 'passage_questions':
      return pq.gradePassageQuestions(content as pq.PassageQuestionsContent, answer as pq.PassageQuestionsAnswer);
    case 'matching':
      return mt.gradeMatching(content as mt.MatchingContent, answer as mt.MatchingAnswer);
    case 'cloze':
      return cz.gradeCloze(content as cz.ClozeContent, answer as cz.ClozeAnswer);
    case 'audio_questions':
      return aq.gradeAudioQuestions(content as aq.AudioQuestionsContent, answer as aq.AudioQuestionsAnswer);
  }
}

export function correctTexts(type: SetTaskType, content: TaskContent): string[] {
  switch (type) {
    case 'passage_questions':
      return pq.correctTextPassageQuestions(content as pq.PassageQuestionsContent);
    case 'matching':
      return mt.correctTextMatching(content as mt.MatchingContent);
    case 'cloze':
      return cz.correctTextCloze(content as cz.ClozeContent);
    case 'audio_questions':
      return aq.correctTextAudioQuestions(content as aq.AudioQuestionsContent);
  }
}

export function resultFromItems(itemResults: boolean[]): GradeResult {
  const ratio = itemResults.length === 0 ? 0 : itemResults.filter(Boolean).length / itemResults.length;
  return ratio >= 0.8 ? 'correct' : ratio >= 0.5 ? 'almost' : 'wrong';
}

export function itemCount(type: SetTaskType, content: TaskContent): number {
  switch (type) {
    case 'passage_questions':
      return (content as pq.PassageQuestionsContent).questions.length;
    case 'matching':
      return (content as mt.MatchingContent).items.length;
    case 'cloze':
      return (content as cz.ClozeContent).gaps.length;
    case 'audio_questions':
      return (content as aq.AudioQuestionsContent).questions.length;
  }
}
