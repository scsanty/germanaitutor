import type Database from 'better-sqlite3';
import type { GradeResult } from '../tutoring/grading';
import { buildFreeTextGradingPrompt, parseFreeTextGrade, type FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { generateWithActiveProvider } from './aiService';

export type FreeTextGradeOutcome = { ok: true; result: GradeResult; feedback: string } | { ok: false; error: string };

export async function gradeFreeText(
  db: Database.Database,
  input: FreeTextGradingInput,
  keyFilePath?: string
): Promise<FreeTextGradeOutcome> {
  const response = await generateWithActiveProvider(db, buildFreeTextGradingPrompt(input), keyFilePath);
  if (!response.ok) return response;
  const parsed = parseFreeTextGrade(response.text);
  if (!parsed) return { ok: false, error: 'The AI replied in an unexpected format' };
  return { ok: true, ...parsed };
}
