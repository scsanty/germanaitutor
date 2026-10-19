// Server-only: reads anchor files with node:fs. Client components must never import this module.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMAT_ID } from '../exam/formats';
import { validateLetter } from '../tasks/letter';
import type { Anchor } from './letterGrading';
import { pointsFor, type Grade, type WritingRubric } from './rubric';

export type { Anchor };

// data/writing-anchors/<formatId>/<partId>.json: four graded reference letters (A, B, C, D) for one letter part.
export interface AnchorFile {
  formatId: string;
  partId: string;
  anchors: Anchor[];
}

// Same as formats.ts: the path is built at runtime, so the file calls opt out of Turbopack tracing.
const DIR = () => join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'writing-anchors');

// Ids can come from request data; only these shapes ever reach the filesystem.
const PART_ID = /^[a-z0-9-]+$/;

// The anchors for one format part, or null when the ids are malformed or the file is missing or unreadable.
// Null is the caller's cue to grade with the rubric only and notify the admin.
export function readAnchors(formatId: string, partId: string): Anchor[] | null {
  if (!FORMAT_ID.test(formatId) || !PART_ID.test(partId)) return null;
  const path = join(DIR(), formatId, `${partId}.json`);
  if (!existsSync(path)) return null;
  try {
    const file = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, 'utf8')) as Partial<AnchorFile>;
    return Array.isArray(file.anchors) ? file.anchors : null;
  } catch {
    return null;
  }
}

const gradesOf = (a: Anchor, r: WritingRubric) => r.criteria.map((c) => a.grades[c.id]);
const allA = (a: Anchor, r: WritingRubric) => gradesOf(a, r).every((g) => g === 'A');
const mostlyD = (a: Anchor, r: WritingRubric) => gradesOf(a, r).filter((g) => g === 'D').length * 2 > r.criteria.length;

// The 2-3 anchors for a grading call, in prompt order: the all-A anchor, the mostly-D anchor, and the
// remaining anchor nearest an all-B grade (the pass band). Anchors that don't exist are simply left out.
export function selectAnchors(anchors: Anchor[], rubric: WritingRubric): Anchor[] {
  const picked: Anchor[] = [];
  const top = anchors.find((a) => allA(a, rubric));
  if (top) picked.push(top);
  const bottom = anchors.find((a) => !picked.includes(a) && mostlyD(a, rubric));
  if (bottom) picked.push(bottom);
  const allB = Object.fromEntries(rubric.criteria.map((c) => [c.id, 'B' as Grade]));
  const target = pointsFor(rubric, allB);
  const middle = anchors
    .filter((a) => !picked.includes(a))
    .map((a) => ({ a, distance: Math.abs(pointsFor(rubric, a.grades) - target) }))
    .sort((x, y) => x.distance - y.distance)[0]?.a;
  if (middle) picked.push(middle);
  return picked;
}

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

// Content checks for one anchor file against its part's rubric.
export function anchorProblems(file: AnchorFile, rubric: WritingRubric): string[] {
  const problems: string[] = [];
  const anchors = Array.isArray(file.anchors) ? file.anchors : [];
  if (anchors.length !== 4) problems.push(`expected 4 anchors, found ${anchors.length}`);
  const ids = new Set(rubric.criteria.map((c) => c.id));
  anchors.forEach((a, i) => {
    const n = `anchor ${i + 1}`;
    if (!nonEmpty(a.letter)) problems.push(`${n}: letter must be non-empty`);
    if (!nonEmpty(a.justification)) problems.push(`${n}: justification must be non-empty`);
    for (const p of validateLetter({ tasks: [a.task] })) problems.push(`${n}: ${p}`);
    const grades = a.grades ?? {};
    for (const c of rubric.criteria) {
      const g = grades[c.id];
      if (g === undefined) problems.push(`${n}: criterion ${c.id} is not graded`);
      else if (c.points[g] === undefined) problems.push(`${n}: criterion ${c.id} has grade ${g}, which the rubric does not have`);
    }
    for (const id of Object.keys(grades)) if (!ids.has(id)) problems.push(`${n}: unknown criterion ${id}`);
  });
  if (!anchors.some((a) => allA(a, rubric))) problems.push('no anchor is graded A on every criterion');
  if (!anchors.some((a) => mostlyD(a, rubric))) problems.push('no anchor is graded D on most criteria');
  return problems;
}
