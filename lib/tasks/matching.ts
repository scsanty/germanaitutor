import type { LocalizedText } from '../i18n/localizedText';

export interface MatchingContent {
  instruction?: LocalizedText;
  items: string[];
  targets: string[];
  answers: (number | null)[];
  allowNone: boolean;
}
export type MatchingView = Omit<MatchingContent, 'answers'>;
// null = "x" (none fits); -1 = unanswered (always wrong).
export interface MatchingAnswer {
  type: 'matching';
  selected: (number | null)[];
}

const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function validateMatching(content: unknown): string[] {
  const c = content as Partial<MatchingContent>;
  const problems: string[] = [];
  if (!Array.isArray(c?.items) || c!.items.length === 0 || !c!.items.every(text)) problems.push('items must be a non-empty list of texts');
  if (!Array.isArray(c?.targets) || c!.targets.length < 2 || !c!.targets.every(text)) problems.push('targets must be at least 2 texts');
  if (!Array.isArray(c?.answers) || c!.answers.length !== (c?.items?.length ?? -1)) return [...problems, 'answers must have one entry per item'];
  c!.answers.forEach((a, i) => {
    if (a === null) {
      if (!c!.allowNone) problems.push(`answer ${i + 1} is "none" but allowNone is false`);
    } else if (!Number.isInteger(a) || a < 0 || a >= (c!.targets?.length ?? 0)) problems.push(`answer ${i + 1} points outside the targets`);
  });
  return problems;
}

export function viewMatching(c: MatchingContent): MatchingView {
  return { ...(c.instruction ? { instruction: c.instruction } : {}), items: c.items, targets: c.targets, allowNone: c.allowNone };
}

export function parseMatchingAnswer(raw: unknown, c: MatchingContent): MatchingAnswer | null {
  const a = raw as { type?: unknown; selected?: unknown };
  if (a?.type !== 'matching' || !Array.isArray(a.selected) || a.selected.length !== c.items.length) return null;
  const ok = a.selected.every((s) => s === null || s === -1 || (Number.isInteger(s) && (s as number) >= 0 && (s as number) < c.targets.length));
  return ok ? { type: 'matching', selected: a.selected as (number | null)[] } : null;
}

// Review Focus 4: -1 (unanswered) never equals a right answer, so it is always wrong.
export function gradeMatching(c: MatchingContent, a: MatchingAnswer): { itemResults: boolean[] } {
  return { itemResults: c.answers.map((right, i) => a.selected[i] === right) };
}

export function correctTextMatching(c: MatchingContent): string[] {
  return c.answers.map((a) => (a === null ? 'x' : c.targets[a]));
}
