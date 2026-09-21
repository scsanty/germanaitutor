import type { Track, CefrLevel } from '../types';

const ALL_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const ALL_TRACKS: Track[] = ['generic', 'telc', 'goethe'];

function parseCommaList<T extends string>(envValue: string | undefined, allValues: T[]): T[] {
  if (!envValue) return allValues;
  const requested = envValue.split(',').map((s) => s.trim()) as T[];
  return allValues.filter((v) => requested.includes(v));
}

export function getScopedLevels(): CefrLevel[] {
  return parseCommaList(process.env.CURRICULUM_GEN_LEVELS, ALL_LEVELS);
}

export function getScopedTracks(): Track[] {
  return parseCommaList(process.env.CURRICULUM_GEN_TRACKS, ALL_TRACKS);
}
