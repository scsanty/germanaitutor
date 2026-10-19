// Server-only: reads anchor files with node:fs. Client components must never import this module.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMAT_ID, readFormat } from '../exam/formats';
import { validateLetter } from '../tasks/letter';
import type { Anchor } from './letterGrading';
import { pointsFor, type Grade, type RubricCriterion, type WritingRubric } from './rubric';

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

// The anchors for one format part, or null when the ids are malformed, the part has no rubric, the file is
// missing or unreadable, an entry has no grades, or fewer than 2 anchors would be selected.
// Null is the caller's cue to grade with the rubric only and notify the admin.
export function readAnchors(formatId: string, partId: string): Anchor[] | null {
  if (!FORMAT_ID.test(formatId) || !PART_ID.test(partId)) return null;
  const rubric = readFormat(formatId)?.parts.find((p) => p.id === partId)?.rubric;
  const path = join(DIR(), formatId, `${partId}.json`);
  if (!rubric || !existsSync(path)) return null;
  let anchors: unknown;
  try {
    anchors = (JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, 'utf8')) as Partial<AnchorFile>).anchors;
  } catch {
    return null;
  }
  if (!Array.isArray(anchors)) return null;
  const graded = anchors.every((a) => typeof a?.grades === 'object' && a.grades !== null && !Array.isArray(a.grades));
  if (!graded || selectAnchors(anchors as Anchor[], rubric).length < 2) return null;
  return anchors as Anchor[];
}

// A criterion's highest-points (sign 1) or lowest-points (sign -1) grade, so rubrics with an E band work too.
function extremeGrade(c: RubricCriterion, sign: 1 | -1): Grade | undefined {
  let best: [Grade, number] | undefined;
  for (const [g, p] of Object.entries(c.points) as [Grade, number | undefined][]) {
    if (p !== undefined && (!best || sign * (p - best[1]) > 0)) best = [g, p];
  }
  return best?.[0];
}

// The top anchor has every criterion's highest-points grade.
const isTop = (a: Anchor, r: WritingRubric) => r.criteria.every((c) => a.grades?.[c.id] === extremeGrade(c, 1));
// The bottom anchor has every criterion's lowest-points grade, or all but one.
const isBottom = (a: Anchor, r: WritingRubric) =>
  r.criteria.filter((c) => a.grades?.[c.id] === extremeGrade(c, -1)).length >= Math.max(1, r.criteria.length - 1);

// The 2-3 anchors for a grading call, in prompt order: the top anchor, the bottom anchor, and the
// remaining anchor nearest an all-B grade (the pass band). Anchors that don't exist are simply left out.
export function selectAnchors(anchors: Anchor[], rubric: WritingRubric): Anchor[] {
  const picked: Anchor[] = [];
  const top = anchors.find((a) => isTop(a, rubric));
  if (top) picked.push(top);
  const bottom = anchors.find((a) => !picked.includes(a) && isBottom(a, rubric));
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
  if (!anchors.some((a) => isTop(a, rubric))) problems.push('no anchor has the top grade on every criterion');
  if (!anchors.some((a) => isBottom(a, rubric))) problems.push('no anchor has the lowest grade on every criterion, or all but one');
  return problems;
}
