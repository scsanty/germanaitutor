import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { CefrLevel } from '../types';
import type { MultipleChoiceContent, FillBlankContent, FreeTextContent } from '../curriculum/types';
import { validateExerciseContent } from '../curriculum/exerciseContentValidation';
import { LEVELS, isCefrLevel, levelIndex } from './levels';

export type PlacementQuestionType = 'multiple_choice' | 'fill_blank' | 'free_text';

export const PLACEMENT_QUESTION_TYPES: readonly PlacementQuestionType[] = ['multiple_choice', 'fill_blank', 'free_text'];

export type PlacementQuestion =
  | { id: string; level: CefrLevel; type: 'multiple_choice'; content: MultipleChoiceContent }
  | { id: string; level: CefrLevel; type: 'fill_blank'; content: FillBlankContent }
  | { id: string; level: CefrLevel; type: 'free_text'; content: FreeTextContent };

export type ExamFormat = 'json' | 'yaml';

export type ExamParseResult = { ok: true; questions: PlacementQuestion[] } | { ok: false; errors: string[] };

export function validatePlacementExam(data: unknown): ExamParseResult {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { questions?: unknown }).questions)) {
    return { ok: false, errors: ['The file must contain a "questions" list'] };
  }
  const raw = (data as { questions: unknown[] }).questions;
  if (raw.length === 0) return { ok: false, errors: ['The "questions" list is empty'] };

  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenLevels = new Set<CefrLevel>();
  let previousLevel: CefrLevel | null = null;

  raw.forEach((entry, index) => {
    const label = `Question ${index + 1}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: must be an object`);
      return;
    }
    const q = entry as Record<string, unknown>;
    const hasId = typeof q.id === 'string' && q.id.trim() !== '';
    const name = hasId ? `${label} (${q.id as string})` : label;

    if (!hasId) errors.push(`${label}: id must be a non-empty string`);
    else if (seenIds.has(q.id as string)) errors.push(`${name}: duplicate id`);
    else seenIds.add(q.id as string);

    if (!isCefrLevel(q.level)) {
      errors.push(`${name}: level must be one of ${LEVELS.join(', ')}`);
    } else {
      if (previousLevel && levelIndex(q.level) < levelIndex(previousLevel)) {
        errors.push(
          `${name}: level ${q.level} comes after ${previousLevel}; questions must be ordered from easiest to hardest level`
        );
      }
      previousLevel = q.level;
      seenLevels.add(q.level);
    }

    if (!PLACEMENT_QUESTION_TYPES.includes(q.type as PlacementQuestionType)) {
      errors.push(`${name}: type must be one of ${PLACEMENT_QUESTION_TYPES.join(', ')}`);
    } else {
      for (const problem of validateExerciseContent(q.type, q.content)) errors.push(`${name}: ${problem}`);
    }
  });

  for (const level of LEVELS) {
    if (!seenLevels.has(level)) {
      errors.push(`The exam has no ${level} questions; every level from A1 to C1 needs at least one`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    questions: raw.map((entry) => {
      const { id, level, type, content } = entry as PlacementQuestion;
      return { id, level, type, content } as PlacementQuestion;
    }),
  };
}

export function parsePlacementExam(text: string, format: ExamFormat): ExamParseResult {
  let data: unknown;
  try {
    data = format === 'json' ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    return { ok: false, errors: [`The file is not valid ${format.toUpperCase()}: ${(err as Error).message}`] };
  }
  return validatePlacementExam(data);
}

export function serializePlacementExam(questions: PlacementQuestion[], format: ExamFormat): string {
  const data = { questions: questions.map(({ id, level, type, content }) => ({ id, level, type, content })) };
  return format === 'json' ? `${JSON.stringify(data, null, 2)}\n` : stringifyYaml(data);
}
