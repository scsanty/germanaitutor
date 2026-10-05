import type Database from 'better-sqlite3';
import type { NormalizeOutcome } from './deckService';
import { generateWithActiveProvider } from './aiService';
import { buildNormalizePrompt } from '../freestyle/prompts';
import { parseNormalizeReply } from '../freestyle/replies';

export async function normalizeWord(db: Database.Database, word: string, sentence: string | null): Promise<NormalizeOutcome> {
  const reply = await generateWithActiveProvider(db, buildNormalizePrompt(word, sentence));
  if (!reply.ok) return reply;
  const parsed = parseNormalizeReply(reply.text);
  return parsed ? { ok: true, ...parsed } : { ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' };
}
