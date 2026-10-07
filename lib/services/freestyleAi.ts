import type Database from 'better-sqlite3';
import type { NormalizeOutcome } from './deckService';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';
import { buildNormalizePrompt } from '../freestyle/prompts';
import { parseNormalizeReply } from '../freestyle/replies';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';

export type ParsedAiResult<T> = { ok: true; value: T } | { ok: false; error: string; code: ErrorCode; params?: ErrorParams };

// One AI call plus its parser: a provider failure passes through (no_provider, ai_failed, ...),
// and a reply the parser rejects becomes ai_bad_reply.
export async function generateParsed<T>(
  generate: (request: AiRequest) => Promise<AiResult>,
  request: AiRequest,
  parse: (text: string) => T | null
): Promise<ParsedAiResult<T>> {
  const reply = await generate(request);
  if (!reply.ok) return { ok: false, error: reply.error, code: reply.code ?? 'ai_failed', params: reply.params };
  const value = parse(reply.text);
  return value ? { ok: true, value } : { ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' };
}

export async function normalizeWord(db: Database.Database, word: string, sentence: string | null): Promise<NormalizeOutcome> {
  const result = await generateParsed((request) => generateWithActiveProvider(db, request), buildNormalizePrompt(word, sentence), parseNormalizeReply);
  return result.ok ? { ok: true, ...result.value } : result;
}
