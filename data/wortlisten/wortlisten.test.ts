import { describe, it, expect } from 'vitest';
import { LEVELS } from '@/lib/tutoring/levels';
import { lemmaKey } from '@/lib/deck/lemmaKey';
import { readWordList, wordListProblems } from '@/lib/deck/wordLists';

describe('bundled word lists', () => {
  it('are valid, level by level, with no word repeated from a lower level', () => {
    const lower = new Set<string>();
    for (const level of LEVELS) {
      const file = readWordList(level);
      expect(file.level).toBe(level);
      expect(file.source).toBe(['B2', 'C1'].includes(level) ? 'nadoch' : 'official');
      expect(wordListProblems(file, lower)).toEqual([]);
      for (const e of file.entries) lower.add(lemmaKey(e.lemma));
    }
  });
});
