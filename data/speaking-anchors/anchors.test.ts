import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { listFormats, readFormat } from '@/lib/exam/formats';
import { readSpokenAnchors, spokenAnchorProblems, type SpokenAnchorFile } from '@/lib/speaking/anchors';
import { isBottom, isTop } from '@/lib/writing/anchors';

const DIR = join(__dirname);
const files = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(join(DIR, d.name))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ dir: d.name, name: f, file: JSON.parse(readFileSync(join(DIR, d.name, f), 'utf8')) as SpokenAnchorFile })),
  );

describe('bundled speaking anchors', () => {
  // Every track, so a new format can't ship a spoken part without anchors.
  it('cover every spoken part of every format', () => {
    const parts = listFormats()
      .flatMap((f) => f.parts.filter((p) => p.taskType === 'spoken').map((p) => `${f.id}/${p.id}`));
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.filter((key) => !existsSync(join(DIR, `${key}.json`)))).toEqual([]);
  });

  // Each file holds the A, C and D anchors in that order: A has the top grade everywhere, D the lowest (or all but one).
  it.each(files.map((f) => [`${f.dir}/${f.name}`, f] as const))('%s is valid for its format part', (_, { dir, name, file }) => {
    expect(file.formatId).toBe(dir);
    expect(`${file.partId}.json`).toBe(name);
    const part = readFormat(file.formatId)?.parts.find((p) => p.id === file.partId);
    expect(part, 'format part').toBeDefined();
    expect(part!.taskType).toBe('spoken');
    expect(part!.rubric, 'rubric').toBeDefined();
    const rubric = part!.rubric!;
    expect(spokenAnchorProblems(file, rubric)).toEqual([]);
    expect(file.anchors.map((a) => a.band)).toEqual(['A', 'C', 'D']);
    const [top, middle, bottom] = file.anchors;
    expect(isTop(top, rubric), 'A anchor at the top').toBe(true);
    expect(isTop(middle, rubric) || isBottom(middle, rubric), 'C anchor between the extremes').toBe(false);
    expect(isBottom(bottom, rubric), 'D anchor at the bottom').toBe(true);
    expect(readSpokenAnchors(file.formatId, file.partId)).toHaveLength(3);
  });
});
