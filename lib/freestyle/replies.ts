import { extractJsonObject } from '../ai/json';
import type { LocalizedText } from '../i18n/localizedText';
import type { GradeResult } from '../tutoring/grading';
import { lemmaKey, nounHasArticle } from '../deck/lemmaKey';

export interface Correction {
  wrong: string;
  right: string;
  reason: LocalizedText;
}

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const localizedPair = (v: unknown): LocalizedText | null => {
  const o = v as { en?: unknown; de?: unknown } | null;
  return o && str(o.en) && str(o.de) ? { en: o.en.trim(), de: o.de.trim() } : null;
};

function corrections(value: unknown): Correction[] | null {
  if (!Array.isArray(value)) return null;
  const out: Correction[] = [];
  for (const c of value as Record<string, unknown>[]) {
    if (!c || !str(c.wrong) || !str(c.right) || !str(c.reason_en) || !str(c.reason_de)) return null;
    out.push({ wrong: c.wrong, right: c.right, reason: { en: c.reason_en, de: c.reason_de } });
  }
  return out;
}

const PARTS_OF_SPEECH: readonly string[] = ['noun', 'verb', 'adjective', 'adverb', 'other'];

export function parseNormalizeReply(text: string) {
  const o = extractJsonObject(text);
  if (!o || !str(o.lemma) || !str(o.partOfSpeech) || !str(o.meaningEn) || !str(o.meaningDe)) return null;
  if (o.plural !== null && o.plural !== undefined && typeof o.plural !== 'string') return null;
  // "Noun" and "noun" are the same; anything outside the enum is a bad reply.
  const partOfSpeech = o.partOfSpeech.trim().toLowerCase();
  if (!PARTS_OF_SPEECH.includes(partOfSpeech)) return null;
  // M6: the same article rule as the word lists, so "Hund" never enters the deck.
  if (partOfSpeech === 'noun' && !nounHasArticle(o.lemma.trim())) return null;
  return { lemma: o.lemma.trim(), partOfSpeech, plural: (o.plural as string | null | undefined) ?? null, meaningEn: o.meaningEn, meaningDe: o.meaningDe };
}

export function parseConversationReply(text: string): { corrections: Correction[]; reply: string } | null {
  const o = extractJsonObject(text);
  const list = o ? corrections(o.corrections) : null;
  if (!o || !list || !str(o.reply)) return null;
  return { corrections: list, reply: o.reply.trim() };
}

export function parseDrillReply(text: string): { verdict: GradeResult | null; explanation: LocalizedText | null; next: string } | null {
  const o = extractJsonObject(text);
  if (!o || !str(o.next)) return null;
  if (o.verdict !== null && o.verdict !== 'correct' && o.verdict !== 'almost' && o.verdict !== 'wrong') return null;
  const explanation = o.verdict === null ? null : localizedPair({ en: o.explanation_en, de: o.explanation_de });
  if (o.verdict !== null && !explanation) return null;
  return { verdict: o.verdict as GradeResult | null, explanation, next: o.next.trim() };
}

export function parseArticleReply(text: string) {
  const o = extractJsonObject(text);
  if (!o || !str(o.title) || !str(o.text) || !Array.isArray(o.questions)) return null;
  if (o.questions.length < 3 || o.questions.length > 5) return null;
  const questions = [];
  for (const q of o.questions as Record<string, unknown>[]) {
    if (!q || !str(q.question) || !Array.isArray(q.options) || q.options.length < 2 || !q.options.every(str)) return null;
    if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) return null;
    questions.push({ question: q.question, options: q.options as string[], correctIndex: q.correctIndex });
  }
  return { title: o.title, text: o.text, questions };
}

export function parseWritingReply(text: string): { corrections: Correction[]; corrected: string; comment: LocalizedText } | null {
  const o = extractJsonObject(text);
  const list = o ? corrections(o.corrections) : null;
  const comment = o ? localizedPair({ en: o.comment_en, de: o.comment_de }) : null;
  if (!o || !list || !str(o.corrected) || !comment) return null;
  return { corrections: list, corrected: o.corrected, comment };
}

export const SUMMARY_CAPS = { wentWell: 3, mistakes: 3, words: 8 } as const;

export function parseSummaryReply(text: string) {
  const o = extractJsonObject(text);
  if (!o || !Array.isArray(o.wentWell) || !Array.isArray(o.mistakes) || !Array.isArray(o.words)) return null;
  const wentWell = o.wentWell.map(localizedPair);
  const mistakes = o.mistakes.map(localizedPair);
  if (wentWell.includes(null) || mistakes.includes(null)) return null;
  // The prompt asks for up to 3, 3 and 8; a longer reply is cut, and a word named twice kept once.
  const words: { lemma: string; meaningEn: string }[] = [];
  const seen = new Set<string>();
  for (const w of o.words as Record<string, unknown>[]) {
    if (!w || !str(w.lemma) || !str(w.meaningEn)) return null;
    const key = lemmaKey(w.lemma);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({ lemma: w.lemma, meaningEn: w.meaningEn });
  }
  return {
    wentWell: (wentWell as LocalizedText[]).slice(0, SUMMARY_CAPS.wentWell),
    mistakes: (mistakes as LocalizedText[]).slice(0, SUMMARY_CAPS.mistakes),
    words: words.slice(0, SUMMARY_CAPS.words),
  };
}
