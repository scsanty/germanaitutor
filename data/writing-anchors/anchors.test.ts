import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { listFormats, readFormat } from '@/lib/exam/formats';
import { anchorProblems, type AnchorFile } from '@/lib/writing/anchors';
import { pointsFor } from '@/lib/writing/rubric';

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

  it('cover every letter part of every exam format', () => {
    const missing = listFormats()
      .flatMap((f) => f.parts.filter((p) => p.taskType === 'letter').map((p) => `${f.id}/${p.id}`))
      .filter((key) => !existsSync(join(DIR, `${key}.json`)));
    expect(missing).toEqual([]);
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

  // Only the bottom anchor may miss the word target (too short is part of what makes it a D).
  it.each(files.map((f) => [`${f.dir}/${f.name}`, f.file] as const))('%s keeps every letter but the lowest within its word target', (_, file) => {
    const rubric = readFormat(file.formatId)!.parts.find((p) => p.id === file.partId)!.rubric!;
    const ranked = [...file.anchors].sort((x, y) => pointsFor(rubric, y.grades) - pointsFor(rubric, x.grades));
    for (const a of ranked.slice(0, -1)) {
      const n = words(a.letter);
      const where = `${Object.values(a.grades).join('')}: ${n} words`;
      expect(n, where).toBeGreaterThanOrEqual(a.task.wordTarget.min);
      expect(n, where).toBeLessThanOrEqual(a.task.wordTarget.max);
    }
  });
});
