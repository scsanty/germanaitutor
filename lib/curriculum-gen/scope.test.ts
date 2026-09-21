import { describe, it, expect, afterEach } from 'vitest';
import { getScopedLevels, getScopedTracks } from './scope';

describe('getScopedLevels/getScopedTracks', () => {
  afterEach(() => {
    delete process.env.CURRICULUM_GEN_LEVELS;
    delete process.env.CURRICULUM_GEN_TRACKS;
  });

  it('returns all levels/tracks when no env var is set', () => {
    expect(getScopedLevels()).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
    expect(getScopedTracks()).toEqual(['generic', 'telc', 'goethe']);
  });

  it('restricts to the requested subset, preserving canonical order', () => {
    process.env.CURRICULUM_GEN_LEVELS = 'B1, A1';
    expect(getScopedLevels()).toEqual(['A1', 'B1']);
    process.env.CURRICULUM_GEN_TRACKS = 'telc';
    expect(getScopedTracks()).toEqual(['telc']);
  });
});
