import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatProblems, readFormat, formatId, type ExamFormat } from './formats';

const base: ExamFormat = {
  id: 'telc-b1',
  track: 'telc',
  level: 'B1',
  name: 'telc Deutsch B1',
  sources: ['https://example.org'],
  blocks: [{ id: 'written', title: { en: 'Written', de: 'Schriftlich' }, minutes: 30, partIds: ['lesen-1'], passRatio: 0.6 }],
  parts: [
    { id: 'lesen-1', skill: 'reading', title: { en: 'Reading Part 1', de: 'Leseverstehen Teil 1' }, taskType: 'matching', items: 5, points: 25, minutes: 30, instructions: 'Lesen Sie …' },
  ],
};

describe('formatProblems', () => {
  it('accepts a consistent format', () => {
    expect(formatProblems(base)).toEqual([]);
  });

  it('names unknown parts, duplicate ids, bad numbers, unknown task types, and minute mismatches', () => {
    const broken: ExamFormat = {
      ...base,
      blocks: [{ ...base.blocks[0], partIds: ['lesen-1', 'lesen-9'], minutes: 60 }],
      parts: [base.parts[0], { ...base.parts[0], taskType: 'essay' as never, items: 0 }],
    };
    expect(formatProblems(broken)).toEqual([
      'part lesen-1: duplicate id',
      'part lesen-1: items must be a positive whole number',
      'part lesen-1: unknown task type essay',
      'block written: unknown part lesen-9',
    ]);
  });

  it('names a block whose minutes differ from its parts by more than 1', () => {
    expect(formatProblems({ ...base, blocks: [{ ...base.blocks[0], minutes: 45 }] })).toEqual([
      'block written: minutes 45 differ from its parts (30)',
    ]);
  });
});

describe('formatProblems for letter parts', () => {
  const crit = (id: string) => ({ id, name: { en: id, de: id }, descriptors: { A: 'x', D: 'y' }, points: { A: 10, D: 0 } });
  const letter = (over: Partial<ExamFormat['parts'][number]>): ExamFormat => ({
    ...base,
    blocks: [{ ...base.blocks[0], partIds: ['schreiben'], minutes: 30 }],
    parts: [{ id: 'schreiben', skill: 'writing', title: { en: 'W', de: 'S' }, taskType: 'letter', items: 2, points: 20, minutes: 30, instructions: 'Schreiben Sie …', ...over }],
  });

  it('does not require a rubric until a part starts to carry writing fields (TODO(T10))', () => {
    expect(formatProblems(letter({}))).toEqual([]);
  });

  it('accepts a complete letter part', () => {
    expect(formatProblems(letter({ rubric: { criteria: [crit('a'), crit('b')] }, wordTarget: { min: 100, max: 150 }, choices: 1 }))).toEqual([]);
  });

  it('names a broken rubric, a mismatched item count and maximum, a bad word target and choices', () => {
    expect(
      formatProblems(letter({ rubric: { criteria: [crit('a'), crit('a'), crit('b')] }, wordTarget: { min: 150, max: 100 }, choices: 3 as never }))
    ).toEqual([
      'part schreiben: criterion a: duplicate id',
      "part schreiben: items must equal the rubric's 3 criteria",
      "part schreiben: the rubric's maximum 30 must equal the part's points 20",
      'part schreiben: wordTarget needs 0 < min < max',
      'part schreiben: choices must be 1 or 2',
    ]);
  });

  it('asks for the missing pieces of a partly filled letter part', () => {
    expect(formatProblems(letter({ choices: 1 }))).toEqual(['part schreiben: a writing part needs a rubric', 'part schreiben: wordTarget needs 0 < min < max']);
  });

  it('skips cloze parts, which carry no rubric', () => {
    expect(formatProblems(letter({ taskType: 'cloze', items: 5, points: 5, choices: undefined }))).toEqual([]);
  });
});

describe('readFormat', () => {
  it('reads a known format and builds ids', () => {
    expect(formatId('telc', 'B1')).toBe('telc-b1');
    expect(readFormat('telc-b1')?.id).toBe('telc-b1');
  });

  it('returns null for unknown ids and path traversal', () => {
    expect(readFormat('telc-c2')).toBeNull();
    expect(readFormat('../../package')).toBeNull();
    expect(readFormat('../exam-formats/telc-b1')).toBeNull();
    expect(readFormat('telc-b1.json')).toBeNull();
    expect(readFormat('')).toBeNull();
  });

  it('opts its file access out of Turbopack tracing', () => {
    const source = readFileSync(join(process.cwd(), 'lib/exam/formats.ts'), 'utf8');
    expect(source).toContain('/*turbopackIgnore: true*/ process.cwd()');
    expect(source).toContain('readdirSync(/*turbopackIgnore: true*/');
    expect(source).toContain('readFileSync(/*turbopackIgnore: true*/');
  });
});
