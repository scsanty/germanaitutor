import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listFormats, readFormat } from '@/lib/exam/formats';
import { teilSetProblems, type BundledSetFile } from '@/lib/exam/teilSets';

const ROOT = join(process.cwd(), 'data', 'teil-sets');

describe('bundled Teil sets', () => {
  it('match their parts and are complete', () => {
    for (const formatDir of readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d)) && !d.endsWith('.ts') && !d.startsWith('.'))) {
      const format = readFormat(formatDir);
      expect(format, formatDir).not.toBeNull();
      for (const file of readdirSync(join(ROOT, formatDir)).filter((f) => f.endsWith('.json') && !f.startsWith('.'))) {
        const bundle = JSON.parse(readFileSync(join(ROOT, formatDir, file), 'utf8')) as BundledSetFile;
        const part = format!.parts.find((p) => p.id === bundle.partId);
        expect(part, `${formatDir}/${file}`).toBeDefined();
        for (const { id, set } of bundle.sets) expect(teilSetProblems(set, part!), id).toEqual([]);
      }
    }
  });

  // Final review M5 (T5 ruling): a listening part with no sets is never runnable, which would silently
  // disable that format's whole mock. Every audio part of every format ships at least 3 sets.
  it('give every listening part of every format at least 3 sets', () => {
    const formats = listFormats();
    expect(formats.length).toBe(15);
    let parts = 0;
    for (const format of formats) {
      const dir = join(ROOT, format.id);
      const counts = new Map<string, number>();
      for (const file of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')) : []) {
        const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8')) as BundledSetFile;
        counts.set(bundle.partId, (counts.get(bundle.partId) ?? 0) + bundle.sets.length);
      }
      for (const part of format.parts.filter((p) => p.taskType === 'audio_questions')) {
        parts += 1;
        expect(counts.get(part.id) ?? 0, `${format.id}/${part.id}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(parts).toBeGreaterThan(0);
  });
});
