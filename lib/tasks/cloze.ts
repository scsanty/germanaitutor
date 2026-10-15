import type { LocalizedText } from '../i18n/localizedText';
import { gradeFillBlank } from '../tutoring/grading';

type Gap = { mode: 'typed'; answer: string; variants?: string[] } | { mode: 'select'; options: string[]; correctIndex: number } | { mode: 'bank'; answer: number };

export interface ClozeContent {
  instruction?: LocalizedText;
  text: string;
  gaps: Gap[];
  bank?: string[];
}
export interface ClozeView {
  instruction?: LocalizedText;
  text: string;
  gaps: ({ mode: 'typed' } | { mode: 'select'; options: string[] } | { mode: 'bank' })[];
  bank?: string[];
}
export interface ClozeAnswer {
  type: 'cloze';
  values: (string | number | null)[];
}

const GAP = /\{\{(\d+)\}\}/g;
const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const GAP_MODES = new Set(['typed', 'select', 'bank']);

export function validateCloze(content: unknown): string[] {
  const c = content as Partial<ClozeContent>;
  const problems: string[] = [];
  if (typeof c?.text !== 'string' || !c.text.trim()) return ['text must be a non-empty string'];
  const marks = [...c.text.matchAll(GAP)].map((m) => Number(m[1]));
  const gaps = Array.isArray(c.gaps) ? c.gaps : [];
  if (marks.length !== gaps.length) problems.push(`the text has ${marks.length} gaps but ${gaps.length} are defined`);
  else if (!marks.every((n, i) => n === i + 1)) problems.push('gaps must be numbered {{1}}, {{2}} … in order');
  gaps.forEach((g, i) => {
    // AI and uploaded content can hold anything here; an unknown mode would be ungradeable, and null would throw.
    if (typeof g !== 'object' || g === null || !GAP_MODES.has((g as { mode?: unknown }).mode as string)) {
      problems.push(`gap ${i + 1} needs a mode of typed, select or bank`);
      return;
    }
    if (g.mode === 'typed' && !(typeof g.answer === 'string' && g.answer.trim())) problems.push(`gap ${i + 1} needs an answer`);
    if (g.mode === 'typed' && g.variants !== undefined && !(Array.isArray(g.variants) && g.variants.every(nonEmpty))) problems.push(`gap ${i + 1} has an empty variant`);
    if (g.mode === 'select' && (!Array.isArray(g.options) || g.options.length < 2 || !g.options.every(nonEmpty) || !Number.isInteger(g.correctIndex) || g.correctIndex < 0 || g.correctIndex >= g.options.length)) {
      problems.push(`gap ${i + 1} needs at least 2 options with text and a correct one`);
    }
    if (g.mode === 'bank') {
      if (!Array.isArray(c.bank) || c.bank.length === 0) problems.push(`gap ${i + 1} uses the bank but there is none`);
      else if (!Number.isInteger(g.answer) || g.answer < 0 || g.answer >= c.bank.length) problems.push(`gap ${i + 1} points outside the bank`);
    }
  });
  if (gaps.some((g) => g?.mode === 'bank') && Array.isArray(c.bank) && !c.bank.every(nonEmpty)) problems.push('every word in the bank needs text');
  return problems;
}

export function viewCloze(c: ClozeContent): ClozeView {
  return {
    ...(c.instruction ? { instruction: c.instruction } : {}),
    text: c.text,
    gaps: c.gaps.map((g) => (g.mode === 'select' ? { mode: 'select', options: g.options } : { mode: g.mode })),
    ...(c.bank ? { bank: c.bank } : {}),
  };
}

export function parseClozeAnswer(raw: unknown, c: ClozeContent): ClozeAnswer | null {
  const a = raw as { type?: unknown; values?: unknown };
  if (a?.type !== 'cloze' || !Array.isArray(a.values) || a.values.length !== c.gaps.length) return null;
  const ok = a.values.every((v, i) => {
    if (v === null) return true;
    const g = c.gaps[i];
    if (g.mode === 'typed') return typeof v === 'string';
    const size = g.mode === 'select' ? g.options.length : (c.bank?.length ?? 0);
    return Number.isInteger(v) && (v as number) >= 0 && (v as number) < size;
  });
  return ok ? { type: 'cloze', values: a.values as (string | number | null)[] } : null;
}

// Each gap on its own: the same bank word may be right for two gaps (Review Focus 3).
export function gradeCloze(c: ClozeContent, a: ClozeAnswer): { itemResults: boolean[] } {
  return {
    itemResults: c.gaps.map((g, i) => {
      const v = a.values[i];
      if (v === null) return false;
      if (g.mode === 'typed') return gradeFillBlank({ textWithBlank: '___', correctAnswer: g.answer, acceptableVariants: g.variants }, String(v)) === 'correct';
      return g.mode === 'select' ? v === g.correctIndex : v === g.answer;
    }),
  };
}

export function correctTextCloze(c: ClozeContent): string[] {
  return c.gaps.map((g) => (g.mode === 'typed' ? g.answer : g.mode === 'select' ? g.options[g.correctIndex] : c.bank![g.answer]));
}
