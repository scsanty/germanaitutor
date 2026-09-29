import { describe, it, expect } from 'vitest';
import { LEVELS, isCefrLevel, levelIndex, isAtOrBelow, nextLevel, higherLevel, levelsUpTo, TRACKS, isTrack } from './levels';

describe('levels', () => {
  it('orders levels from A1 to C1', () => {
    expect(LEVELS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
    expect(levelIndex('A1')).toBe(0);
    expect(levelIndex('C1')).toBe(4);
  });

  it('recognises CEFR levels', () => {
    expect(isCefrLevel('B2')).toBe(true);
    expect(isCefrLevel('C2')).toBe(false);
    expect(isCefrLevel(3)).toBe(false);
  });

  it('compares a level against a ceiling', () => {
    expect(isAtOrBelow('A2', 'B1')).toBe(true);
    expect(isAtOrBelow('B1', 'B1')).toBe(true);
    expect(isAtOrBelow('B2', 'B1')).toBe(false);
  });

  it('finds the next level, and none after C1', () => {
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('C1')).toBeNull();
  });

  it('picks the higher of two levels', () => {
    expect(higherLevel('A2', 'B1')).toBe('B1');
    expect(higherLevel('C1', 'A1')).toBe('C1');
  });

  it('lists every level up to a ceiling', () => {
    expect(levelsUpTo('B1')).toEqual(['A1', 'A2', 'B1']);
    expect(levelsUpTo('A1')).toEqual(['A1']);
  });
});

describe('tracks', () => {
  it('lists the three tracks in their display order', () => {
    expect(TRACKS).toEqual(['generic', 'telc', 'goethe']);
  });

  it('recognises a track name', () => {
    expect([isTrack('goethe'), isTrack('Goethe'), isTrack('b1'), isTrack(undefined)]).toEqual([true, false, false, false]);
  });
});
