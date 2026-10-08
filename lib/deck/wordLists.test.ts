import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import type { CefrLevel } from '../types';
import { allWordListProblems, wordListPath, wordListProblems, wordListScope, type WordListFile, type WordListScope } from './wordLists';

const file = (entries: WordListFile['entries']): WordListFile => ({ level: 'A1', scope: 'goethe', source: 'official', entries });
const ok = { lemma: 'der Hund', partOfSpeech: 'noun', plural: 'die Hunde', example: 'Der Hund bellt.', meaningEn: 'dog', meaningDe: 'ein Haustier, das bellt' };

describe('wordListProblems', () => {
  it('accepts a well-formed list', () => {
    expect(wordListProblems(file([ok]), new Set())).toEqual([]);
  });

  it('names empty fields, nouns without an article, duplicates, and words from a lower level', () => {
    expect(
      wordListProblems(
        file([
          { ...ok, meaningDe: '' },
          { ...ok, lemma: 'Katze', partOfSpeech: 'noun' },
          { ...ok, lemma: 'der hund' },
          { ...ok, lemma: 'das Haus' },
        ]),
        new Set(['das haus'])
      )
    ).toEqual([
      'der Hund: meaningDe is empty',
      'Katze: a noun needs its article',
      'der hund: duplicate of an earlier entry',
      'das Haus: already in a lower level',
    ]);
  });
});

describe('word list layout', () => {
  it('resolves A1–B1 to the track folder and B2/C1 to shared', () => {
    expect(wordListPath('telc', 'A1', 'lists')).toBe(join('lists', 'telc', 'a1.json'));
    expect(wordListPath('goethe', 'B1', 'lists')).toBe(join('lists', 'goethe', 'b1.json'));
    expect(wordListPath('goethe', 'B2', 'lists')).toBe(join('lists', 'shared', 'b2.json'));
    expect(wordListPath('generic', 'C1', 'lists')).toBe(join('lists', 'shared', 'c1.json'));
    expect(wordListScope('generic', 'A2')).toBe('generic');
    expect(wordListScope('telc', 'C1')).toBe('shared');
  });
});

describe('allWordListProblems', () => {
  const entry = (lemma: string) => ({ ...ok, lemma, partOfSpeech: 'adverb', plural: null });
  // Every list holds one distinct word unless a test overrides it.
  function lists(overrides: Partial<Record<string, string[]>> = {}) {
    return (scope: WordListScope, level: CefrLevel): WordListFile => ({
      level,
      scope,
      source: scope === 'goethe' || scope === 'telc' ? 'official' : 'nadoch',
      entries: (overrides[`${scope}/${level}`] ?? [`${scope}${level}`]).map(entry),
    });
  }

  it('accepts distinct lists', () => {
    expect(allWordListProblems(lists())).toEqual([]);
  });

  it('allows the same word at A1 in two tracks', () => {
    expect(allWordListProblems(lists({ 'goethe/A1': ['gestern'], 'telc/A1': ['gestern'], 'generic/A1': ['gestern'] }))).toEqual([]);
  });

  it('flags a word repeated from a lower level within one track chain only', () => {
    expect(allWordListProblems(lists({ 'telc/A1': ['heute'], 'telc/A2': ['heute'], 'goethe/B1': ['heute'] }))).toEqual([
      'telc/A2: heute: already in a lower level',
    ]);
  });

  it("flags a shared B2 or C1 word that repeats any track's A1–B1, or B2", () => {
    expect(allWordListProblems(lists({ 'generic/B1': ['heute'], 'shared/B2': ['heute', 'morgen'], 'shared/C1': ['morgen'] }))).toEqual([
      'shared/B2: heute: already in a lower level',
      'shared/C1: morgen: already in a lower level',
    ]);
  });

  it('flags a file whose level, scope or source does not match its folder', () => {
    const base = lists();
    const wrong: Record<string, Partial<WordListFile>> = { 'telc/A2': { scope: 'goethe' }, 'goethe/B1': { source: 'nadoch' }, 'shared/C1': { level: 'B2' } };
    const misplaced = (scope: WordListScope, level: CefrLevel): WordListFile => ({ ...base(scope, level), ...wrong[`${scope}/${level}`] });
    expect(allWordListProblems(misplaced)).toEqual(['telc/A2: scope is goethe', 'goethe/B1: source is nadoch', 'shared/C1: level is B2']);
  });
});
