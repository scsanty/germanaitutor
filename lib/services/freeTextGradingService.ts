import type Database from 'better-sqlite3';
import type { LocalizedText } from '../i18n/localizedText';
import type { GradeResult } from '../tutoring/grading';
import { buildFreeTextGradingPrompt, parseFreeTextGrade, type FreeTextGradingInput } from '../tutoring/freeTextGrading';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import { generateWithActiveProvider } from './aiService';

export type FreeTextGradeOutcome =
  | { ok: true; result: GradeResult; feedback: LocalizedText | null }
  | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };

export async function gradeFreeText(
  db: Database.Database,
  input: FreeTextGradingInput,
  keyFilePath?: string
): Promise<FreeTextGradeOutcome> {
  const response = await generateWithActiveProvider(db, buildFreeTextGradingPrompt(input), keyFilePath);
  if (!response.ok) return response;
  const parsed = parseFreeTextGrade(response.text);
  if (!parsed) return { ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' };
  return { ok: true, ...parsed };
}
