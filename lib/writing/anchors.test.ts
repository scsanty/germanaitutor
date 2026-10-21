import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { anchorProblems, readAnchors, selectAnchors, type AnchorFile } from './anchors';
import type { Anchor } from './letterGrading';
import type { Grade, WritingRubric } from './rubric';

const POINTS = { A: 15, B: 10, C: 5, D: 0 };
const DESCRIPTORS = { A: 'a', B: 'b', C: 'c', D: 'd' };
const RUBRIC: WritingRubric = {
  criteria: ['aufgabe', 'gestaltung', 'richtigkeit'].map((id) => ({ id, name: { en: id, de: id }, points: POINTS, descriptors: DESCRIPTORS })),
};

const TASK = {
  situation: 'Sie sind umgezogen.',
  leitpunkte: ['Wohnung', 'Nachbarn', 'Weg zur Arbeit', 'Einladung'],
  register: 'informal' as const,
  wordTarget: { min: 120, max: 180 },
};

const anchor = (label: string, aufgabe: Grade, gestaltung: Grade, richtigkeit: Grade): Anchor => ({
  task: TASK,
  letter: `Brief ${label}`,
  grades: { aufgabe, gestaltung, richtigkeit },
  justification: `Begründung ${label}.`,
});

const A = anchor('A', 'A', 'A', 'A');
const B = anchor('B', 'B', 'B', 'B');
const C = anchor('C', 'C', 'C', 'C');
const D = anchor('D', 'D', 'C', 'D');

describe('selectAnchors', () => {
  it('picks A, D and B from four anchors, in that order', () => {
    expect(selectAnchors([C, B, D, A], RUBRIC)).toEqual([A, D, B]);
  });

  it('picks what exists when there are only two', () => {
    expect(selectAnchors([D, A], RUBRIC)).toEqual([A, D]);
    expect(selectAnchors([B, A], RUBRIC)).toEqual([A, B]);
  });

  it('falls back to the anchor nearest B when there is no B anchor', () => {
    expect(selectAnchors([A, C, D], RUBRIC)).toEqual([A, D, C]);
  });

  it('returns nothing for no anchors', () => {
    expect(selectAnchors([], RUBRIC)).toEqual([]);
  });

  // The zero rule scores a lowest task grade 0, so such a letter is never the pass-band reference,
  // and a zeroed bottom anchor is still the bottom.
  it('applies the zero rule when picking the middle anchor, and still finds the top and bottom', () => {
    const zeroed: WritingRubric = { ...RUBRIC, zeroesTextOn: { criterion: 'aufgabe', grade: 'D' } };
    const offTopic = anchor('X', 'D', 'A', 'A');
    expect(selectAnchors([offTopic, C, D, A], RUBRIC)).toEqual([A, D, offTopic]);
    expect(selectAnchors([offTopic, C, D, A], zeroed)).toEqual([A, D, C]);
    expect(anchorProblems({ formatId: 'telc-b1', partId: 'schreiben', anchors: [A, B, C, D] }, zeroed)).toEqual([]);
  });
});

describe('anchorProblems', () => {
  const file = (anchors: Anchor[]): AnchorFile => ({ formatId: 'telc-b1', partId: 'schreiben', anchors });

  it('accepts four valid anchors', () => {
    expect(anchorProblems(file([A, B, C, D]), RUBRIC)).toEqual([]);
  });

  it('names a missing criterion', () => {
    const broken: Anchor = { ...B, grades: { aufgabe: 'B', gestaltung: 'B' } };
    expect(anchorProblems(file([A, broken, C, D]), RUBRIC)).toEqual(['anchor 2: criterion richtigkeit is not graded']);
  });

  it('names an unknown criterion and a grade the rubric does not have', () => {
    const broken: Anchor = { ...C, grades: { aufgabe: 'C', gestaltung: 'E', richtigkeit: 'C', stil: 'C' } };
    expect(anchorProblems(file([A, B, broken, D]), RUBRIC)).toEqual([
      'anchor 3: criterion gestaltung has grade E, which the rubric does not have',
      'anchor 3: unknown criterion stil',
    ]);
  });

  it('wants exactly four anchors, including an all-A and a mostly-D one', () => {
    expect(anchorProblems(file([B, C]), RUBRIC)).toEqual([
      'expected 4 anchors, found 2',
      'no anchor has the top grade on every criterion',
      'no anchor has the lowest grade on every criterion, or all but one',
    ]);
  });

  it('wants the bottom anchor at the lowest grade on all criteria but at most one', () => {
    const soft = anchor('D', 'D', 'C', 'C');
    expect(anchorProblems(file([A, B, C, soft]), RUBRIC)).toEqual(['no anchor has the lowest grade on every criterion, or all but one']);
  });

  it('takes the top and bottom grades from the rubric points, so an E band works', () => {
    const withE: WritingRubric = {
      criteria: RUBRIC.criteria.map((c) => ({ ...c, points: { A: 4, B: 3, C: 2, D: 1, E: 0 }, descriptors: { ...DESCRIPTORS, E: 'e' } })),
    };
    expect(anchorProblems(file([A, B, C, anchor('D', 'D', 'D', 'D')]), withE)).toEqual([
      'no anchor has the lowest grade on every criterion, or all but one',
    ]);
    const E = anchor('E', 'E', 'D', 'E');
    expect(anchorProblems(file([A, B, C, E]), withE)).toEqual([]);
    expect(selectAnchors([B, E, C, A], withE)).toEqual([A, E, B]);
  });

  it('wants a letter, a justification and a valid task', () => {
    const broken: Anchor = { ...B, letter: ' ', justification: '', task: { ...TASK, leitpunkte: ['nur einer'] } };
    expect(anchorProblems(file([A, broken, C, D]), RUBRIC)).toEqual([
      'anchor 2: letter must be non-empty',
      'anchor 2: justification must be non-empty',
      'anchor 2: task 1: leitpunkte must be 3 to 4 non-empty strings',
    ]);
  });
});

describe('readAnchors', () => {
  afterEach(() => vi.restoreAllMocks());

  // A scratch project root holding the telc B1 format and the given anchor list.
  const rootWith = (anchors: unknown) => {
    const root = mkdtempSync(join(tmpdir(), 'anchors-'));
    mkdirSync(join(root, 'data', 'exam-formats'), { recursive: true });
    mkdirSync(join(root, 'data', 'writing-anchors', 'telc-b1'), { recursive: true });
    copyFileSync(join(process.cwd(), 'data', 'exam-formats', 'telc-b1.json'), join(root, 'data', 'exam-formats', 'telc-b1.json'));
    writeFileSync(join(root, 'data', 'writing-anchors', 'telc-b1', 'schreiben.json'), JSON.stringify({ formatId: 'telc-b1', partId: 'schreiben', anchors }));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
  };

  it('reads a valid file', () => {
    rootWith([A, B, C, D]);
    expect(readAnchors('telc-b1', 'schreiben')).toEqual([A, B, C, D]);
  });

  it('returns null when an entry has no grades object', () => {
    rootWith([A, { ...B, grades: undefined }, C, D]);
    expect(readAnchors('telc-b1', 'schreiben')).toBeNull();
    rootWith([A, { ...B, grades: ['B'] }, C, D]);
    expect(readAnchors('telc-b1', 'schreiben')).toBeNull();
  });

  it('returns null when fewer than 2 anchors would be selected', () => {
    rootWith([]);
    expect(readAnchors('telc-b1', 'schreiben')).toBeNull();
    rootWith([A]);
    expect(readAnchors('telc-b1', 'schreiben')).toBeNull();
  });

  it('returns null for unparsable JSON', () => {
    rootWith([]);
    writeFileSync(join(process.cwd(), 'data', 'writing-anchors', 'telc-b1', 'schreiben.json'), '{ not json');
    expect(readAnchors('telc-b1', 'schreiben')).toBeNull();
  });

  it('refuses ids that are not format or part shapes', () => {
    expect(readAnchors('../etc', 'schreiben')).toBeNull();
    expect(readAnchors('telc-b1', '../../package')).toBeNull();
    expect(readAnchors('telc-b1', 'Schreiben')).toBeNull();
  });

  it('returns null when there is no file', () => {
    expect(readAnchors('generic-a1', 'no-such-part')).toBeNull();
  });

  it('reads the bundled telc B1 anchors', () => {
    expect(readAnchors('telc-b1', 'schreiben')).toHaveLength(4);
  });
});
