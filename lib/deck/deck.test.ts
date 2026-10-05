import { describe, it, expect } from 'vitest';
import { lemmaKey } from './lemmaKey';
import { selectIntroductions } from './introduction';
import { deckRemaining, selectDeckDue } from './deckQueue';

describe('lemmaKey', () => {
  it('lowercases, trims, and collapses spaces, keeping the article', () => {
    expect(lemmaKey('  Der   Hund ')).toBe('der hund');
    expect(lemmaKey('die See')).not.toBe(lemmaKey('der See'));
  });

  it('keys a decomposed umlaut the same as the composed one', () => {
    const decomposed = 'für';
    const composed = 'für';
    expect(decomposed).not.toBe(composed);
    expect(lemmaKey(decomposed)).toBe(lemmaKey(composed));
  });
});

describe('selectIntroductions', () => {
  const words = [
    { id: 1, level: 'B1' as const, order: 0 },
    { id: 2, level: 'A1' as const, order: 5 },
    { id: 3, level: 'A1' as const, order: 1 },
    { id: 4, level: 'A2' as const, order: 0 },
  ];

  it('takes the lowest level first, then list order, up to the daily number', () => {
    expect(selectIntroductions(words, 0, 3)).toEqual([3, 2, 4]);
  });

  // Review Focus 3: words already introduced today count against the daily number.
  it('introduces only what is left for today', () => {
    expect(selectIntroductions(words, 2, 3)).toEqual([3]);
    expect(selectIntroductions(words, 3, 3)).toEqual([]);
    expect(selectIntroductions(words, 0, 0)).toEqual([]);
  });
});

describe('deck queue', () => {
  it('takes due items, most overdue first, up to what is left today', () => {
    const items = [
      { itemId: 1, nextDueAt: '2026-09-29' },
      { itemId: 2, nextDueAt: '2026-09-20' },
      { itemId: 3, nextDueAt: '2026-10-02' },
    ];
    expect(selectDeckDue(items, '2026-09-29', 5).map((i) => i.itemId)).toEqual([2, 1]);
    expect(selectDeckDue(items, '2026-09-29', 1).map((i) => i.itemId)).toEqual([2]);
    expect(deckRemaining(50, 48)).toBe(2);
    expect(deckRemaining(50, 60)).toBe(0);
  });
});
