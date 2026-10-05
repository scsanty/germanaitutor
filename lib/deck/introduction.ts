import { levelIndex } from '../tutoring/levels';
import type { CefrLevel } from '../types';

// Spec: new starter words per day, lowest level first, then list order. Words already
// introduced today count, so opening the deck again never introduces more.
export function selectIntroductions(
  candidates: { id: number; level: CefrLevel | null; order: number }[],
  alreadyToday: number,
  perDay: number
): number[] {
  const left = Math.max(0, perDay - alreadyToday);
  if (left === 0) return [];
  return [...candidates]
    .sort((a, b) => levelIndex(a.level ?? 'C1') - levelIndex(b.level ?? 'C1') || a.order - b.order)
    .slice(0, left)
    .map((c) => c.id);
}
