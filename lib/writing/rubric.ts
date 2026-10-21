import type { LocalizedText } from '../i18n/localizedText';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E'];

export interface RubricCriterion {
  id: string;
  name: LocalizedText;
  descriptors: Partial<Record<Grade, string>>;
  points: Partial<Record<Grade, number>>;
}

export interface WritingRubric {
  criteria: RubricCriterion[];
  // telc B1-C1 and Goethe B1-C1: this grade on this criterion makes the whole text worth 0 points.
  zeroesTextOn?: { criterion: string; grade: Grade };
}

const maxOf = (c: RubricCriterion) => Math.max(0, ...Object.values(c.points).map((p) => p ?? 0));

export function rubricMaxPoints(r: WritingRubric): number {
  return r.criteria.reduce((sum, c) => sum + maxOf(c), 0);
}

// True when the rubric's zero rule applies to these grades.
export function isZeroed(r: WritingRubric, grades: Record<string, Grade>): boolean {
  return r.zeroesTextOn !== undefined && grades[r.zeroesTextOn.criterion] === r.zeroesTextOn.grade;
}

// The one scoring function: letter grading, Teil scoring, lesson scoring and anchor selection all use it.
export function pointsFor(r: WritingRubric, grades: Record<string, Grade>): number {
  if (isZeroed(r, grades)) return 0;
  return r.criteria.reduce((sum, c) => {
    const g = grades[c.id];
    return sum + (g ? (c.points[g] ?? 0) : 0);
  }, 0);
}

export function rubricProblems(r: WritingRubric): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of r.criteria) {
    if (GRADES.every((g) => c.points[g] === undefined && c.descriptors[g] === undefined)) {
      problems.push(`criterion ${c.id} has no grades`);
    } else {
      for (const g of GRADES) {
        const p = c.points[g];
        if ((p === undefined) !== (c.descriptors[g] === undefined)) {
          problems.push(`criterion ${c.id}: grade ${g} needs both points and a descriptor`);
        }
        // Not only whole numbers: Goethe's bands use halves and quarters (10 / 7.5 / 5 / 2.5 / 0).
        if (p !== undefined && !(typeof p === 'number' && Number.isFinite(p) && p >= 0)) {
          problems.push(`criterion ${c.id}: grade ${g} points must be a non-negative number`);
        }
      }
    }
    if (seen.has(c.id)) problems.push(`criterion ${c.id}: duplicate id`);
    seen.add(c.id);
  }
  const zero = r.zeroesTextOn;
  if (zero) {
    const c = r.criteria.find((x) => x.id === zero.criterion);
    if (!c) problems.push(`zero rule: unknown criterion ${zero.criterion}`);
    else if (c.points[zero.grade] === undefined) problems.push(`zero rule: criterion ${c.id} has no grade ${zero.grade}`);
  }
  return problems;
}

const POINTS = { A: 5, B: 3, C: 1, D: 0 };

// The rubric for lesson letters: three criteria, graded A-D, out of 15.
export const LESSON_LETTER_RUBRIC: WritingRubric = {
  criteria: [
    {
      id: 'task',
      name: { en: 'Task completion', de: 'Aufgabenbewältigung' },
      points: POINTS,
      descriptors: {
        A: 'Every point of the task is covered, in enough detail, and the text suits the situation.',
        B: 'Most points are covered; one is thin or missing.',
        C: 'Only some points are covered, or most are barely touched.',
        D: 'The task is not really addressed.',
      },
    },
    {
      id: 'communication',
      name: { en: 'Communicative design', de: 'Kommunikative Gestaltung' },
      points: POINTS,
      descriptors: {
        A: 'The text is well organised, with a fitting opening and closing, and the tone and register suit the reader.',
        B: 'The structure is mostly clear; the register slips now and then.',
        C: 'The structure is hard to follow, or the register is often wrong.',
        D: 'There is no recognisable structure, and the text does not suit its reader.',
      },
    },
    {
      id: 'accuracy',
      name: { en: 'Formal accuracy', de: 'Formale Richtigkeit' },
      points: POINTS,
      descriptors: {
        A: 'Vocabulary and grammar are varied and almost always correct; spelling errors are rare.',
        B: 'There are some errors, but they hardly disturb understanding.',
        C: 'Errors are frequent and sometimes make the text hard to understand.',
        D: 'Errors are so many that the text is mostly incomprehensible.',
      },
    },
  ],
};
