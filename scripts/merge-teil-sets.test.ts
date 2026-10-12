// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeTeilSets } from './merge-teil-sets';

const REAL = join(process.cwd(), 'data');
let root: string;
let work: string;

const matchingSet = (text = 'Text') => ({
  taskType: 'matching',
  content: {
    items: Array.from({ length: 5 }, (_, i) => `${text} ${i + 1}`),
    targets: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    answers: [0, 1, 2, 3, 4],
    allowNone: false,
  },
  explanations: Array.from({ length: 5 }, (_, i) => ({ en: `Because ${i}`, de: `Weil ${i}` })),
});

function put(id: string, set: unknown, file = id.split('__').slice(1).join('__') + '.json', format = 'telc-b1') {
  mkdirSync(join(work, format), { recursive: true });
  writeFileSync(join(work, format, file), JSON.stringify({ id, set }));
}
const out = () => JSON.parse(readFileSync(join(root, 'teil-sets', 'telc-b1', 'lesen-1.json'), 'utf8'));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'teil-root-'));
  work = mkdtempSync(join(tmpdir(), 'teil-work-'));
  cpSync(join(REAL, 'exam-formats'), join(root, 'exam-formats'), { recursive: true });
  cpSync(join(process.cwd(), 'test', 'fixtures', 'teil-sets', 'telc-b1'), join(root, 'teil-sets', 'telc-b1'), { recursive: true });
});

describe('mergeTeilSets', () => {
  it('keeps the existing set and sorts by id', () => {
    put('telc-b1__lesen-1__s03', matchingSet());
    put('telc-b1__lesen-1__s02', matchingSet());
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(true);
    expect(r.lines).toContain('telc-b1/lesen-1: 3 sets OK');
    expect(out().sets.map((s: { id: string }) => s.id)).toEqual(['telc-b1__lesen-1__s01', 'telc-b1__lesen-1__s02', 'telc-b1__lesen-1__s03']);
    expect(r.itemCounts['telc-b1']).toBe(15);
  });

  it('replaces a set with the same id', () => {
    put('telc-b1__lesen-1__s01', matchingSet('Neu'));
    expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(true);
    const o = out();
    expect(o.sets).toHaveLength(1);
    expect(o.sets[0].set.content.items[0]).toBe('Neu 1');
  });

  it('does not write with --check-only', () => {
    put('telc-b1__lesen-1__s02', matchingSet());
    expect(mergeTeilSets({ workDir: work, dataRoot: root, checkOnly: true }).ok).toBe(true);
    expect(out().sets).toHaveLength(1);
  });

  it('rejects an item-count mismatch', () => {
    const s = matchingSet();
    s.content.items.pop();
    s.content.answers.pop();
    s.explanations.pop();
    put('telc-b1__lesen-1__s02', s);
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/5 items/);
    expect(out().sets).toHaveLength(1);
  });

  it('rejects a wrong task type', () => {
    put('telc-b1__lesen-1__s02', { ...matchingSet(), taskType: 'passage_questions' });
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/needs matching/);
  });

  it('rejects a missing explanation', () => {
    const s = matchingSet();
    s.explanations[2] = { en: 'ok', de: ' ' };
    put('telc-b1__lesen-1__s02', s);
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/English and German/);
  });

  it('rejects an id that does not match its path', () => {
    put('telc-b1__lesen-1__s05', matchingSet(), 'lesen-1__s02.json');
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/does not match the file path/);
  });

  it('rejects an instruction field', () => {
    const s = matchingSet() as { content: Record<string, unknown> };
    s.content.instruction = { en: 'Match.' };
    put('telc-b1__lesen-1__s02', s);
    expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(false);
  });
});
