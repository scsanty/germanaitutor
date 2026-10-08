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
