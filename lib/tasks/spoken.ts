export interface SpokenPartContent {
  situation: string;
  materials: { title: string; points: string[] }[];
  examinerIntro: string;
  partner: { name: string; gender: 'm' | 'f'; profile: string };
  turns: number;
}
export type SpokenPartView = SpokenPartContent;
// A spoken attempt finishes only through the spoken routes; this is what `teil_attempts.answers` holds.
export interface SpokenAnswer {
  type: 'spoken';
  clipIds: string[];
}

export const SPOKEN_MIN_TURNS = 4;
export const SPOKEN_MAX_TURNS = 10;

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function validateSpokenPart(content: unknown): string[] {
  const c = content as Partial<SpokenPartContent> | null;
  if (!c || typeof c !== 'object') return ['a spoken part needs content'];
  const problems: string[] = [];
  if (!nonEmpty(c.situation)) problems.push('situation must be a non-empty string');
  if (!nonEmpty(c.examinerIntro)) problems.push('examinerIntro must be a non-empty string');
  if (!Array.isArray(c.materials) || !c.materials.every((m) => nonEmpty(m?.title) && Array.isArray(m?.points) && m.points.every(nonEmpty))) {
    problems.push('materials must be a list of { title, points } with non-empty strings');
  }
  const p = c.partner;
  if (!nonEmpty(p?.name)) problems.push('partner.name must be a non-empty string');
  if (p?.gender !== 'm' && p?.gender !== 'f') problems.push('partner.gender must be m or f');
  if (!nonEmpty(p?.profile)) problems.push('partner.profile must be a non-empty string');
  if (!Number.isInteger(c.turns) || (c.turns as number) < SPOKEN_MIN_TURNS || (c.turns as number) > SPOKEN_MAX_TURNS) {
    problems.push(`turns must be a whole number from ${SPOKEN_MIN_TURNS} to ${SPOKEN_MAX_TURNS}`);
  }
  return problems;
}

// Nothing in a spoken part is secret.
export const viewSpokenPart = (c: SpokenPartContent): SpokenPartView => c;
