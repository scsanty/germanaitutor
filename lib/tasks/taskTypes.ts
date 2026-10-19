import type { GradeResult } from '../tutoring/grading';
import * as pq from './passageQuestions';
import * as mt from './matching';
import * as cz from './cloze';
import * as aq from './audioQuestions';
import * as lt from './letter';

export type SetTaskType = 'passage_questions' | 'matching' | 'cloze' | 'audio_questions' | 'letter';
export type TaskContent = pq.PassageQuestionsContent | mt.MatchingContent | cz.ClozeContent | aq.AudioQuestionsContent | lt.LetterContent;
export type TaskView = pq.PassageQuestionsView | mt.MatchingView | cz.ClozeView | aq.AudioQuestionsView | lt.LetterView;
export type TaskAnswer = pq.PassageQuestionsAnswer | mt.MatchingAnswer | cz.ClozeAnswer | aq.AudioQuestionsAnswer | lt.LetterAnswer;

export function isSetTaskType(v: unknown): v is SetTaskType {
  return v === 'passage_questions' || v === 'matching' || v === 'cloze' || v === 'audio_questions' || v === 'letter';
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
    case 'letter':
      return lt.validateLetter(content);
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
    case 'letter':
      return lt.viewLetter(content as lt.LetterContent);
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
    case 'letter':
      return lt.parseLetterAnswer(raw, content as lt.LetterContent);
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
    case 'letter':
      throw new Error('a letter is graded by the AI');
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
    case 'letter':
      throw new Error('a letter has no single correct text');
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
    case 'letter':
      throw new Error('a letter set has one item per rubric criterion; use the part');
  }
}
