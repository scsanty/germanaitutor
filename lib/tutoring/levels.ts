import type { CefrLevel, Track } from '../types';

export const LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function levelIndex(level: CefrLevel): number {
  return LEVELS.indexOf(level);
}

export function isAtOrBelow(level: CefrLevel, ceiling: CefrLevel): boolean {
  return levelIndex(level) <= levelIndex(ceiling);
}

export function nextLevel(level: CefrLevel): CefrLevel | null {
  return LEVELS[levelIndex(level) + 1] ?? null;
}

export function higherLevel(a: CefrLevel, b: CefrLevel): CefrLevel {
  return levelIndex(a) >= levelIndex(b) ? a : b;
}

export function levelsUpTo(ceiling: CefrLevel): CefrLevel[] {
  return LEVELS.filter((level) => isAtOrBelow(level, ceiling));
}

export const TRACKS: readonly Track[] = ['generic', 'telc', 'goethe'];

export function isTrack(value: unknown): value is Track {
  return typeof value === 'string' && (TRACKS as readonly string[]).includes(value);
}
