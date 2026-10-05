import { describe, it, expect } from 'vitest';
import { wordListProblems, type WordListFile } from './wordLists';

const file = (entries: WordListFile['entries']): WordListFile => ({ level: 'A1', source: 'official', entries });
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
