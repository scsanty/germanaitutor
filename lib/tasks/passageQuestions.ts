import type { LocalizedText } from '../i18n/localizedText';

export interface PassageQuestionsContent {
  instruction?: LocalizedText;
  passage: string;
  questions: { question: string; options: string[]; correctIndex: number }[];
}
export type PassageQuestionsView = Omit<PassageQuestionsContent, 'questions'> & { questions: { question: string; options: string[] }[] };
export interface PassageQuestionsAnswer {
  type: 'passage_questions';
  selected: (number | null)[];
}

const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function validatePassageQuestions(content: unknown): string[] {
  const c = content as Partial<PassageQuestionsContent>;
  const problems: string[] = [];
  if (!text(c?.passage)) problems.push('passage must be a non-empty string');
  if (!Array.isArray(c?.questions) || c!.questions.length === 0) return [...problems, 'questions must be a non-empty list'];
  c!.questions.forEach((q, i) => {
    if (!text(q?.question)) problems.push(`question ${i + 1} needs text`);
    if (!Array.isArray(q?.options) || q.options.length < 2 || !q.options.every(text)) problems.push(`question ${i + 1} needs at least 2 options`);
    else if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) problems.push(`question ${i + 1} points outside its options`);
  });
  return problems;
}

export function viewPassageQuestions(c: PassageQuestionsContent): PassageQuestionsView {
  return { ...(c.instruction ? { instruction: c.instruction } : {}), passage: c.passage, questions: c.questions.map(({ question, options }) => ({ question, options })) };
}

export function parsePassageQuestionsAnswer(raw: unknown, c: PassageQuestionsContent): PassageQuestionsAnswer | null {
  const a = raw as { type?: unknown; selected?: unknown };
  if (a?.type !== 'passage_questions' || !Array.isArray(a.selected) || a.selected.length !== c.questions.length) return null;
  const ok = a.selected.every((s, i) => s === null || (Number.isInteger(s) && (s as number) >= 0 && (s as number) < c.questions[i].options.length));
  return ok ? { type: 'passage_questions', selected: a.selected as (number | null)[] } : null;
}

export function gradePassageQuestions(c: PassageQuestionsContent, a: PassageQuestionsAnswer): { itemResults: boolean[] } {
  return { itemResults: c.questions.map((q, i) => a.selected[i] === q.correctIndex) };
}

export function correctTextPassageQuestions(c: PassageQuestionsContent): string[] {
  return c.questions.map((q) => q.options[q.correctIndex]);
}
