import type { AudioQuestionsAnswer, AudioQuestionsContent } from './audioQuestions';
import type { ClozeAnswer, ClozeContent } from './cloze';
import type { LetterAnswer } from './letter';
import type { MatchingAnswer, MatchingContent } from './matching';
import type { PassageQuestionsAnswer, PassageQuestionsContent } from './passageQuestions';
import type { SetTaskType, TaskAnswer, TaskContent } from './taskTypes';

// The learner's answer per item, as display text: '' when unanswered, 'x' for matching's "none fits".
export function answerTexts(type: SetTaskType, content: TaskContent, answer: TaskAnswer): string[] {
  if (type === 'letter') return [(answer as LetterAnswer).text];
  if (type === 'passage_questions') {
    const c = content as PassageQuestionsContent;
    return (answer as PassageQuestionsAnswer).selected.map((s, i) => (s === null ? '' : (c.questions[i].options[s] ?? '')));
  }
  if (type === 'audio_questions') {
    const c = content as AudioQuestionsContent;
    return (answer as AudioQuestionsAnswer).selected.map((s, i) => (s === null ? '' : (c.questions[i].options[s] ?? '')));
  }
  if (type === 'matching') {
    const c = content as MatchingContent;
    return (answer as MatchingAnswer).selected.map((s) => (s === null ? 'x' : s < 0 ? '' : (c.targets[s] ?? '')));
  }
  // cloze
  const c = content as ClozeContent;
  return (answer as ClozeAnswer).values.map((v, i) => {
    if (v === null) return '';
    const g = c.gaps[i];
    if (g.mode === 'typed') return String(v);
    return (g.mode === 'select' ? g.options[v as number] : c.bank?.[v as number]) ?? '';
  });
}
