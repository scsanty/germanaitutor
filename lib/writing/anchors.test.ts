import { describe, it, expect } from 'vitest';
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
      'no anchor is graded A on every criterion',
      'no anchor is graded D on most criteria',
    ]);
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
