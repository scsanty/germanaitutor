import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { readFormat } from '@/lib/exam/formats';
import { anchorProblems, type AnchorFile } from '@/lib/writing/anchors';

const DIR = join(__dirname);
const files = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(join(DIR, d.name))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ dir: d.name, name: f, file: JSON.parse(readFileSync(join(DIR, d.name, f), 'utf8')) as AnchorFile })),
  );

const words = (text: string) => text.trim().split(/\s+/).length;

describe('bundled writing anchors', () => {
  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [`${f.dir}/${f.name}`, f] as const))('%s is valid for its format part', (_, { dir, name, file }) => {
    expect(file.formatId).toBe(dir);
    expect(`${file.partId}.json`).toBe(name);
    const part = readFormat(file.formatId)?.parts.find((p) => p.id === file.partId);
    expect(part, 'format part').toBeDefined();
    expect(part!.taskType).toBe('letter');
    expect(part!.rubric, 'rubric').toBeDefined();
    expect(anchorProblems(file, part!.rubric!)).toEqual([]);
  });

  it.each(files.map((f) => [`${f.dir}/${f.name}`, f.file] as const))('%s keeps the A letter within its word target', (_, file) => {
    const top = file.anchors.find((a) => Object.values(a.grades).every((g) => g === 'A'))!;
    const n = words(top.letter);
    expect(n).toBeGreaterThanOrEqual(top.task.wordTarget.min);
    expect(n).toBeLessThanOrEqual(top.task.wordTarget.max);
  });
});
