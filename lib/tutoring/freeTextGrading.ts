import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { LocalizedText } from '../i18n/localizedText';
import type { GradeResult } from './grading';
import { extractJsonObject } from '../ai/json';
import { normalizeCategory, taxonomyIds } from '../errors/taxonomy';

// Spec: Error Log. One mistake the grader found, for the error log.
export interface FreeTextMistake {
  category: string;
  wrong: string;
  right: string;
}

export interface FreeTextGradingInput {
  prompt: string;
  modelAnswer: string;
  studentAnswer: string;
  level: CefrLevel;
}

export function buildFreeTextGradingPrompt(input: FreeTextGradingInput): {
  systemPrompt: string;
  messages: ChatMessage[];
} {
  const systemPrompt = [
    `You are grading a German learner's answer to one exercise at CEFR level ${input.level}.`,
    'Compare the student answer with the model answer. The model answer is one good solution, not the only one: accept any answer that fulfils the task correctly.',
    'Grade it as:',
    '- "correct": fulfils the task with no errors that matter at this level.',
    '- "almost": fulfils the task but has small mistakes (for example a wrong article, ending, or word order).',
    '- "wrong": does not fulfil the task, or has errors that block understanding.',
    'Write the feedback twice: "feedback_en" in English and "feedback_de" in German. Each is one to three short sentences naming the main mistake and its corrected form, if there is one.',
    `Keep the German feedback simple enough for CEFR level ${input.level}.`,
    'List every mistake in "mistakes" (an empty list when there are none).',
    `Reply with only a JSON object: {"result": "correct" | "almost" | "wrong", "feedback_en": "...", "feedback_de": "...", "mistakes": [{ "category": one of ${taxonomyIds().join(', ')}, "wrong": exact wrong words, "right": the correction }]}`,
  ].join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `Task: ${input.prompt}\nModel answer: ${input.modelAnswer}\nStudent answer: ${input.studentAnswer}`,
    },
  ];
  return { systemPrompt, messages };
}

// Optional in the reply: an absent or non-list field is no mistakes, and invalid entries are skipped.
function parseMistakes(value: unknown): FreeTextMistake[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((m) => {
    const entry = m as Record<string, unknown> | null;
    if (!entry || typeof entry !== 'object') return [];
    if (typeof entry.wrong !== 'string' || !entry.wrong.trim() || typeof entry.right !== 'string') return [];
    return [{ category: normalizeCategory(entry.category), wrong: entry.wrong.trim(), right: entry.right.trim() }];
  });
}

export function parseFreeTextGrade(
  text: string
): { result: GradeResult; feedback: LocalizedText | null; mistakes: FreeTextMistake[] } | null {
  const data = extractJsonObject(text);
  if (!data) return null;
  const { result, feedback_en, feedback_de } = data;
  if (result !== 'correct' && result !== 'almost' && result !== 'wrong') return null;
  if (typeof feedback_en !== 'string' || typeof feedback_de !== 'string') return null;
  const en = feedback_en.trim();
  const de = feedback_de.trim();
  // No feedback in either language: nothing to show, rather than an empty "Feedback:" line.
  return { result, feedback: en || de ? { en, de } : null, mistakes: parseMistakes(data.mistakes) };
}
