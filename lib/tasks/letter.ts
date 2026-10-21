import type { LocalizedText } from '../i18n/localizedText';

export type LetterRegister = 'informal' | 'semi_formal' | 'formal';

export interface LetterTask {
  situation: string;
  leitpunkte: string[];
  register: LetterRegister;
  wordTarget: { min: number; max: number };
}

// `instruction` exists for lessons; Teil sets are German-only and carry none.
export interface LetterContent {
  instruction?: LocalizedText;
  tasks: LetterTask[];
}
export type LetterView = LetterContent;
export interface LetterAnswer {
  type: 'letter';
  taskIndex: number;
  text: string;
}

// The longest letter the server accepts (the textarea has the same limit), as in Freestyle.
export const LETTER_MAX_LENGTH = 6000;

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function validateLetter(content: unknown): string[] {
  const c = content as Partial<LetterContent> | null;
  if (!Array.isArray(c?.tasks) || c.tasks.length < 1 || c.tasks.length > 2) return ['a letter needs 1 or 2 tasks'];
  const problems: string[] = [];
  c.tasks.forEach((t, i) => {
    const n = `task ${i + 1}`;
    if (!nonEmpty(t?.situation)) problems.push(`${n}: situation must be a non-empty string`);
    if (!Array.isArray(t?.leitpunkte) || t.leitpunkte.length < 3 || t.leitpunkte.length > 4 || !t.leitpunkte.every(nonEmpty)) {
      problems.push(`${n}: leitpunkte must be 3 to 4 non-empty strings`);
    }
    if (!['informal', 'semi_formal', 'formal'].includes(t?.register as string)) problems.push(`${n}: register must be informal, semi_formal or formal`);
    const w = t?.wordTarget;
    if (!(typeof w?.min === 'number' && typeof w?.max === 'number' && w.min > 0 && w.min < w.max)) problems.push(`${n}: wordTarget needs 0 < min < max`);
  });
  return problems;
}

export function parseLetterAnswer(raw: unknown, c: LetterContent): LetterAnswer | null {
  const a = raw as { type?: unknown; taskIndex?: unknown; text?: unknown };
  if (a?.type !== 'letter' || typeof a.text !== 'string' || a.text.length > LETTER_MAX_LENGTH) return null;
  if (!Number.isInteger(a.taskIndex) || (a.taskIndex as number) < 0 || (a.taskIndex as number) >= c.tasks.length) return null;
  return { type: 'letter', taskIndex: a.taskIndex as number, text: a.text };
}

export const viewLetter = (c: LetterContent): LetterView => c;
