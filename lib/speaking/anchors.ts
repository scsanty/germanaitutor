// Server-only: reads anchor files with node:fs. Client components must never import this module.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMAT_ID, readFormat } from '../exam/formats';
import { isBottom, isTop, selectAnchors } from '../writing/anchors';
import type { WritingRubric } from '../writing/rubric';
import type { SpokenAnchor } from './spokenGrading';

export type { SpokenAnchor };

// data/speaking-anchors/<formatId>/<partId>.json: three graded reference conversations (bands A, C and D) for one spoken part.
export interface SpokenAnchorFile {
  formatId: string;
  partId: string;
  anchors: SpokenAnchor[];
}

// The path is built at runtime, so the file calls opt out of Turbopack tracing (as in writing/anchors.ts).
const DIR = () => join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'speaking-anchors');
const PART_ID = /^[a-z0-9-]+$/;

// The anchors for one spoken part, or null when the ids are malformed, the part has no rubric, the file is missing or
// unreadable, an entry has no grades, or fewer than 2 anchors would be selected. Null is the caller's cue to grade
// with the rubric only and notify the admin.
export function readSpokenAnchors(formatId: string, partId: string): SpokenAnchor[] | null {
  if (!FORMAT_ID.test(formatId) || !PART_ID.test(partId)) return null;
  const rubric = readFormat(formatId)?.parts.find((p) => p.id === partId)?.rubric;
  const path = join(DIR(), formatId, `${partId}.json`);
  if (!rubric || !existsSync(path)) return null;
  let anchors: unknown;
  try {
    anchors = (JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, 'utf8')) as Partial<SpokenAnchorFile>).anchors;
  } catch {
    return null;
  }
  if (!Array.isArray(anchors)) return null;
  const valid = anchors.every(
    (a) => typeof a?.grades === 'object' && a.grades !== null && !Array.isArray(a.grades) && Array.isArray(a.turns) && a.turns.every((t: unknown) => typeof t === 'string')
  );
  if (!valid || selectAnchors(anchors as SpokenAnchor[], rubric).length < 2) return null;
  return anchors as SpokenAnchor[];
}

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

// Content checks for one anchor file against its part's rubric.
export function spokenAnchorProblems(file: SpokenAnchorFile, rubric: WritingRubric): string[] {
  const problems: string[] = [];
  const anchors = Array.isArray(file.anchors) ? file.anchors : [];
  if (anchors.length !== 3) problems.push(`expected 3 anchors, found ${anchors.length}`);
  const ids = new Set(rubric.criteria.map((c) => c.id));
  anchors.forEach((a, i) => {
    const n = `anchor ${i + 1}`;
    if (!['A', 'C', 'D'].includes(a.band)) problems.push(`${n}: band must be A, C or D`);
    if (!nonEmpty(a.justification)) problems.push(`${n}: justification must be non-empty`);
    if (!Array.isArray(a.turns) || a.turns.length < 4 || a.turns.length > 8 || !a.turns.every(nonEmpty)) problems.push(`${n}: turns must be 4 to 8 non-empty strings`);
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
