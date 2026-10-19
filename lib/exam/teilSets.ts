import { extractJsonObject } from '../ai/json';
import { hasInstructionKey } from '../curriculum/exerciseContentValidation';
import type { ChatMessage } from '../providers/types';
import type { CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';
import { itemCount, isSetTaskType, validateTask, type SetTaskType, type TaskContent } from '../tasks/taskTypes';
import type { LetterContent } from '../tasks/letter';
import type { ExamPart } from './formats';

export interface TeilSetContent {
  taskType: SetTaskType;
  content: TaskContent;
  explanations: LocalizedText[];
}

export interface BundledSetFile {
  formatId: string;
  partId: string;
  version: string;
  sets: { id: string; set: TeilSetContent }[];
}

export type TeilSetStatus = 'starter' | 'unreviewed' | 'approved' | 'rejected' | 'reserved';

export interface TeilSetRow {
  id: string;
  formatId: string;
  partId: string;
  status: TeilSetStatus;
  itemCount: number;
  createdAt: string;
  reviewedAt: string | null;
  // Null for reserved sets in the admin list (summary fields only).
  set: TeilSetContent | null;
}

function letterSetProblems(set: TeilSetContent, part: ExamPart): string[] {
  const { tasks } = set.content as LetterContent;
  const problems: string[] = [];
  if (part.choices !== undefined && tasks.length !== part.choices) problems.push(`the part offers ${part.choices} task(s), the set has ${tasks.length}`);
  if (part.wordTarget) {
    tasks.forEach((t, i) => {
      if (t.wordTarget.min !== part.wordTarget!.min || t.wordTarget.max !== part.wordTarget!.max) {
        problems.push(`task ${i + 1}: wordTarget must be ${part.wordTarget!.min}-${part.wordTarget!.max} like the part`);
      }
    });
  }
  return problems;
}

export function teilSetProblems(set: TeilSetContent, part: ExamPart): string[] {
  if (set?.taskType !== part.taskType) return [`the part needs ${part.taskType}, not ${set?.taskType}`];
  const problems = validateTask(set.taskType, set.content);
  // Spec (bilingual content): exam content is German-only; the part's German instructions are the only task text.
  if (hasInstructionKey(set.content)) problems.push('Teil sets are German-only and cannot have an instruction');
  if (problems.length > 0) return problems;
  if (set.taskType === 'letter') problems.push(...letterSetProblems(set, part));
  // A letter set has one explanation per rubric criterion, which is the part's item count.
  const items = set.taskType === 'letter' ? part.items : itemCount(set.taskType, set.content);
  if (items !== part.items) problems.push(`the part has ${part.items} items, the set has ${items}`);
  if (!Array.isArray(set.explanations) || set.explanations.length !== items) {
    problems.push(`${items} items need ${items} explanations, found ${Array.isArray(set.explanations) ? set.explanations.length : 0}`);
  } else if (set.explanations.some((e) => typeof e?.en !== 'string' || typeof e?.de !== 'string' || !e.en.trim() || !e.de.trim())) {
    problems.push('every explanation needs English and German');
  }
  return problems;
}

const SHAPE: Record<SetTaskType, string> = {
  passage_questions: '{"passage": "...", "questions": [{"question": "...", "options": ["...", "...", "..."], "correctIndex": 0}]}',
  matching: '{"items": ["..."], "targets": ["..."], "answers": [0], "allowNone": true | false}',
  cloze: '{"text": "... {{1}} ... {{2}} ...", "gaps": [{"mode": "select", "options": ["...", "...", "..."], "correctIndex": 0} | {"mode": "bank", "answer": 0}], "bank": ["..."] (only with bank gaps)}',
  audio_questions: '{"transcript": "[Name m|f] … lines, optional first line @filter …", "questions": [{"question": "...", "options": ["...", "...", "..."], "correctIndex": 0, "evidence": "..."}]}',
  letter: '{"tasks": [{"situation": "...", "leitpunkte": ["...", "..."], "register": "formal" | "informal", "wordTarget": {"min": 80, "max": 100}}]}',
};

// Spec: pool sets are CEFR-style and German-only, in the part's exact format.
export function buildTeilSetPrompt(part: ExamPart, level: CefrLevel): { systemPrompt: string; messages: ChatMessage[] } {
  if (!isSetTaskType(part.taskType)) throw new Error(`No set generation for ${part.taskType}`);
  return {
    systemPrompt: [
      `You write one practice set for the exam part "${part.title.de}" at CEFR level ${level}.`,
      `Follow the real exam format. The task instructions are: ${part.instructions}`,
      `Write everything entirely in German, using vocabulary and grammar appropriate for CEFR level ${level}. The set must have exactly ${part.items} scored items.`,
      'Do not add an "instruction" field; the task instructions above are the only task text.',
      'For every item, add an explanation of the right answer in English and in simple German.',
      `Reply with only a JSON object: {"content": ${SHAPE[part.taskType]}, "explanations": [{"en": "...", "de": "..."}]}`,
    ].join('\n'),
    messages: [{ role: 'user', content: 'Write the set now.' }],
  };
}

export function parseTeilSetReply(text: string, part: ExamPart): TeilSetContent | null {
  const o = extractJsonObject(text);
  if (!o || !isSetTaskType(part.taskType)) return null;
  const set: TeilSetContent = { taskType: part.taskType, content: o.content as TaskContent, explanations: o.explanations as LocalizedText[] };
  // Any malformed reply means no set, so practice falls back instead of failing.
  try {
    return teilSetProblems(set, part).length === 0 ? set : null;
  } catch {
    return null;
  }
}
