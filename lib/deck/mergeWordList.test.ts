import { describe, it, expect } from 'vitest';
import { formatWordListFile, lowerLevels, mergeWordList, sortKey } from './mergeWordList';
import { wordListProblems, type WordListEntry } from './wordLists';

const entry = (lemma: string, extra: Partial<WordListEntry> = {}): WordListEntry => ({
  lemma, partOfSpeech: 'noun', plural: null, example: `${lemma}.`, meaningEn: 'x', meaningDe: 'y', ...extra,
});

describe('sortKey', () => {
  it('files a noun under its word, not its article', () => {
    expect(sortKey('der Hund')).toBe('hund');
    expect(sortKey('der/die Bekannte')).toBe('bekannte');
    expect(sortKey('dabei')).toBe('dabei');
  });
});

describe('mergeWordList', () => {
  it('concatenates the chunks in alphabetical order by lemma without its article', () => {
    const { file } = mergeWordList(
      [[entry('der Hund'), entry('arbeiten', { partOfSpeech: 'verb' })], [entry('das Auto'), entry('die Äpfel'), entry('bald')]],
      'goethe', 'A1', new Set(),
    );
    expect(file.entries.map((e) => e.lemma)).toEqual(['die Äpfel', 'arbeiten', 'das Auto', 'bald', 'der Hund']);
  });

  it('keeps the first of in-level duplicates by lemmaKey, and drops words from lower levels', () => {
    const { file, dropped } = mergeWordList(
      [[entry('der See', { meaningEn: 'lake' }), entry('das Haus')], [entry('der  see', { meaningEn: 'second' }), entry('die See')]],
      'telc', 'A2', new Set(['das haus']),
    );
    expect(file.entries.map((e) => [e.lemma, e.meaningEn])).toEqual([['der See', 'lake'], ['die See', 'x']]);
    expect(dropped).toEqual([
      { lemma: 'das Haus', reason: 'lower level' },
      { lemma: 'der  see', reason: 'duplicate' },
    ]);
  });

  it('NFC-normalizes, so a decomposed umlaut is the same word', () => {
    const decomposed = 'für';
    const { file, dropped } = mergeWordList([[entry('für', { partOfSpeech: 'other' }), entry(decomposed, { partOfSpeech: 'other' })]], 'goethe', 'A1', new Set());
    expect(file.entries).toHaveLength(1);
    expect(dropped).toEqual([{ lemma: 'für', reason: 'duplicate' }]);
  });

  it('sets level, scope and source, keeps only the entry fields, and passes validation', () => {
    const extra = { ...entry('der Hund', { plural: 'die Hunde' }), note: 'from the PDF' } as WordListEntry;
    for (const [scope, source] of [['goethe', 'official'], ['telc', 'official'], ['generic', 'nadoch'], ['shared', 'nadoch']] as const) {
      const { file } = mergeWordList([[extra]], scope, 'B1', new Set());
      expect(file).toMatchObject({ level: 'B1', scope, source });
      expect(Object.keys(file.entries[0])).toEqual(['lemma', 'partOfSpeech', 'plural', 'example', 'meaningEn', 'meaningDe']);
      expect(wordListProblems(file, new Set())).toEqual([]);
    }
  });
});

describe('lowerLevels', () => {
  it("follows the scope's chain", () => {
    expect(lowerLevels('goethe', 'A1')).toEqual([]);
    expect(lowerLevels('telc', 'B1')).toEqual([['telc', 'A1'], ['telc', 'A2']]);
    expect(lowerLevels('shared', 'B2')).toHaveLength(9);
    expect(lowerLevels('shared', 'C1')).toContainEqual(['shared', 'B2']);
    expect(lowerLevels('shared', 'C1')).toContainEqual(['generic', 'B1']);
  });
});

describe('formatWordListFile', () => {
  it('writes one entry per line and parses back to the same file', () => {
    const { file } = mergeWordList([[entry('der Hund'), entry('bald', { partOfSpeech: 'adverb' })]], 'goethe', 'A1', new Set());
    const text = formatWordListFile(file);
    expect(text.split('\n')[5]).toBe('    { "lemma": "bald", "partOfSpeech": "adverb", "plural": null, "example": "bald.", "meaningEn": "x", "meaningDe": "y" },');
    expect(JSON.parse(text)).toEqual(file);
  });
});
