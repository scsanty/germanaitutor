import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { ExerciseContent, ExerciseType, Skill } from '../curriculum/types';
import { validateExerciseContent } from '../curriculum/exerciseContentValidation';

export const MAX_STYLE_EXAMPLES = 10;

export interface PracticeLessonContext {
  title: string;
  level: CefrLevel;
  skill: Skill;
  explanation: string | null;
  examples: string[] | null;
  authoredExercises: { type: ExerciseType; content: ExerciseContent }[];
}

export interface GeneratedExercise {
  type: ExerciseType;
  content: ExerciseContent;
}

const SHAPES: Record<ExerciseType, string> = {
  multiple_choice: 'multiple_choice: {"question": string, "options": [2 to 5 strings], "correctIndex": index of the right option}',
  fill_blank:
    'fill_blank: {"textWithBlank": a sentence with ___ for the gap, "correctAnswer": string, "acceptableVariants": optional array of other accepted answers}',
  flashcard: 'flashcard: {"front": a German word or phrase, "back": its meaning}',
  free_text: 'free_text: {"prompt": the task, "modelAnswer": one good answer}',
};

export function buildPracticeGenerationPrompt(
  ctx: PracticeLessonContext,
  allowedTypes: ExerciseType[],
  count: number
): { systemPrompt: string; messages: ChatMessage[] } {
  const systemPrompt = [
    'You write extra practice exercises for a German course.',
    `The lesson is "${ctx.title}" at CEFR level ${ctx.level} (skill: ${ctx.skill}).`,
    `Write exactly ${count} new exercises. Use only these types: ${allowedTypes.join(', ')}.`,
    // Decision 2026-09-29: practice exercises are CEFR-style and entirely in German — questions, prompts
    // and instructions included — using only words and structures a learner at this level knows.
    `Write everything in German only, including every question, prompt and instruction: no English at all. Use only vocabulary and grammar appropriate for CEFR level ${ctx.level}.`,
    "Match the style and difficulty of the lesson's example exercises.",
    'Do not repeat the example exercises or each other.',
    'Content shapes:',
    ...allowedTypes.map((type) => `- ${SHAPES[type]}`),
    'Reply with only a JSON object: {"exercises": [{"type": "...", "content": {...}}]}',
  ].join('\n');

  const parts: string[] = [];
  if (ctx.explanation) parts.push(`Lesson explanation:\n${ctx.explanation}`);
  if (ctx.examples && ctx.examples.length > 0) {
    parts.push(`Lesson examples:\n${ctx.examples.map((example) => `- ${example}`).join('\n')}`);
  }
  const style = ctx.authoredExercises.slice(0, MAX_STYLE_EXAMPLES);
  if (style.length > 0) parts.push(`Example exercises:\n${JSON.stringify(style)}`);
  parts.push(`Write ${count} new exercises now.`);

  return { systemPrompt, messages: [{ role: 'user', content: parts.join('\n\n') }] };
}

// `null` when the reply is not the expected JSON shape — a failed call, never guessed at.
// Otherwise the usable exercises, in reply order: allowed type, valid content, flashcard rule.
export function parseGeneratedExercises(
  text: string,
  allowedTypes: ExerciseType[],
  skill: Skill
): GeneratedExercise[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = (data as { exercises?: unknown } | null)?.exercises;
  if (!Array.isArray(list)) return null;

  const usable: GeneratedExercise[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { type, content } = item as { type?: unknown; content?: unknown };
    if (typeof type !== 'string' || !(allowedTypes as string[]).includes(type)) continue;
    if (type === 'flashcard' && skill !== 'vocabulary') continue;
    // The practice pool is German-only: an instruction (and the empty question it allows) is never valid here.
    if (content && typeof content === 'object' && 'instruction' in content) continue;
    if (validateExerciseContent(type, content).length > 0) continue;
    usable.push({ type: type as ExerciseType, content: content as ExerciseContent });
  }
  return usable;
}

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])])
    );
  }
  return value;
}

// Duplicate detection: exact after trimming, case-folding, and ordering object keys.
export function contentKey(type: ExerciseType | string, content: unknown): string {
  return `${type}:${JSON.stringify(canonical(content))}`;
}
