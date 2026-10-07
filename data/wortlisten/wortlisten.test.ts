import { describe, it, expect } from 'vitest';
import { allWordListProblems, readWordList } from '@/lib/deck/wordLists';

// Spec (amended 2026-10-08): A1–B1 per track, B2/C1 shared. Lower-level repeats are checked
// along each track's chain (A1 → A2 → B1 → shared B2 → shared C1); overlap between tracks is fine.
describe('bundled word lists', () => {
  it('are valid, sit in the right folder, and repeat no word from a lower level of their chain', () => {
    expect(allWordListProblems((scope, level) => readWordList(scope === 'shared' ? 'generic' : scope, level))).toEqual([]);
  });
});
