import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { GradeResult } from './grading';

export interface FreeTextGradingInput {
  prompt: string;
  modelAnswer: string;
  studentAnswer: string;
  level: CefrLevel;
  uiLanguage: 'en' | 'de';
}

export function buildFreeTextGradingPrompt(input: FreeTextGradingInput): {
  systemPrompt: string;
  messages: ChatMessage[];
} {
  const language = input.uiLanguage === 'de' ? 'German' : 'English';
  const systemPrompt = [
    `You are grading a German learner's answer to one exercise at CEFR level ${input.level}.`,
    'Compare the student answer with the model answer. The model answer is one good solution, not the only one: accept any answer that fulfils the task correctly.',
    'Grade it as:',
    '- "correct": fulfils the task with no errors that matter at this level.',
    '- "almost": fulfils the task but has small mistakes (for example a wrong article, ending, or word order).',
    '- "wrong": does not fulfil the task, or has errors that block understanding.',
    `Write the feedback in ${language}: one to three short sentences naming the main mistake and its corrected form, if there is one.`,
    'Reply with only a JSON object: {"result": "correct" | "almost" | "wrong", "feedback": "..."}',
  ].join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `Task: ${input.prompt}\nModel answer: ${input.modelAnswer}\nStudent answer: ${input.studentAnswer}`,
    },
  ];
  return { systemPrompt, messages };
}

export function parseFreeTextGrade(text: string): { result: GradeResult; feedback: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { result, feedback } = data as Record<string, unknown>;
  if (result !== 'correct' && result !== 'almost' && result !== 'wrong') return null;
  if (typeof feedback !== 'string') return null;
  return { result, feedback: feedback.trim() };
}
