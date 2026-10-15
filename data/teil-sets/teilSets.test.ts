import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFormat } from '@/lib/exam/formats';
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
});
