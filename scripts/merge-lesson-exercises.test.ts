// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeLessonExercises } from './merge-lesson-exercises';

const STEM = 'telc-b1';
const READING = 'b1-telc-reading-teil1-headline-matching';
let root: string;
let work: string;

const matching = (tag = 'A') => ({
  type: 'matching',
  content: {
    instruction: { en: 'Match the headlines.', de: 'Ordnen Sie die Überschriften zu.' },
    items: [`Text ${tag}1`, `Text ${tag}2`],
    targets: ['Überschrift a', 'Überschrift b', 'Überschrift c'],
    answers: [0, 2],
    allowNone: false,
  },
});
const passage = {
  type: 'passage_questions',
  content: { passage: 'Anna wohnt in Köln.', questions: [{ question: 'Wo wohnt Anna?', options: ['Köln', 'Bonn'], correctIndex: 0 }] },
};

const seedPath = () => join(root, 'curriculum-seed', `${STEM}.json`);
const seed = () => JSON.parse(readFileSync(seedPath(), 'utf8'));
const exercisesOf = (id: string) => seed().exercises.filter((e: { lessonId: string }) => e.lessonId === id);
function draft(lessonId: string, items: unknown, stem = STEM) {
  mkdirSync(join(work, stem), { recursive: true });
  writeFileSync(join(work, stem, `${lessonId}.json`), JSON.stringify(items));
}
const run = (extra: { checkOnly?: boolean; seed?: string } = {}) => mergeLessonExercises({ workDir: work, dataRoot: root, ...extra });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lesson-root-'));
  work = mkdtempSync(join(tmpdir(), 'lesson-work-'));
  mkdirSync(join(root, 'curriculum-seed'), { recursive: true });
  cpSync(join(process.cwd(), 'data', 'curriculum-seed', `${STEM}.json`), seedPath());
});

describe('merge-lesson-exercises', () => {
  it('continues the lesson numbering, keeps existing exercises and inserts after them', () => {
    const before = exercisesOf(READING);
    const all = seed().exercises.length;
    draft(READING, [matching(), passage]);
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.added).toBe(2);
    const after = exercisesOf(READING);
    expect(after.slice(0, before.length)).toEqual(before);
    const n = before.length;
    expect(after.slice(n).map((e: { id: string }) => e.id)).toEqual([`${READING}__ex${n}`, `${READING}__ex${n + 1}`]);
    expect(after[n].track).toBe('telc');
    expect(seed().exercises).toHaveLength(all + 2);
    const ids = seed().exercises.map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const idx = seed().exercises.findIndex((e: { id: string }) => e.id === `${READING}__ex${n - 1}`);
    expect(seed().exercises[idx + 1].id).toBe(`${READING}__ex${n}`);
  });

  it('is idempotent, ignoring key order', () => {
    draft(READING, [matching(), passage]);
    run();
    const first = readFileSync(seedPath(), 'utf8');
    const reordered = { type: 'matching', content: Object.fromEntries(Object.entries(matching().content).reverse()) };
    draft(READING, [reordered, passage]);
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.added).toBe(0);
    expect(r.lines.join('\n')).toContain('0 added, 2 already merged');
    expect(readFileSync(seedPath(), 'utf8')).toBe(first);
  });

  it('adds only the new drafts on a partial re-run', () => {
    draft(READING, [matching()]);
    run();
    draft(READING, [matching(), passage]);
    expect(run().added).toBe(1);
  });

  it('rejects a lesson that is not reading', () => {
    const grammar = seed().lessons.find((l: { skill: string }) => l.skill === 'grammar').id;
    const original = readFileSync(seedPath(), 'utf8');
    draft(grammar, [matching()]);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('not reading');
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
  });

  it('rejects an unknown lesson, a bad seed and a non-new type', () => {
    draft('no-such-lesson', [matching()]);
    expect(run().lines.join('\n')).toContain('no such lesson');
    draft('x', [matching()], 'nope-a1');
    expect(run({ seed: 'nope-a1' }).lines.join('\n')).toContain('no such seed file');
    draft(READING, [{ type: 'fill_blank', content: { textWithBlank: 'a ___', correctAnswer: 'b' } }]);
    expect(run({ seed: STEM }).ok).toBe(false);
  });

  it('rejects invalid content and writes nothing, even for the valid drafts', () => {
    const original = readFileSync(seedPath(), 'utf8');
    const bad = matching();
    bad.content.answers = [0, 9];
    draft(READING, [passage, bad]);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('exercise 2');
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
  });

  it('rejects a one-language instruction', () => {
    const bad = matching();
    (bad.content.instruction as { de?: string }).de = '';
    draft(READING, [bad]);
    expect(run().ok).toBe(false);
  });

  it('accepts a top-level instruction on the entry', () => {
    const { instruction, ...content } = matching().content;
    draft(READING, [{ type: 'matching', instruction, content }]);
    expect(run().ok).toBe(true);
    expect(exercisesOf(READING).at(-1).content.instruction).toEqual(instruction);
  });

  it('check-only validates without writing', () => {
    const original = readFileSync(seedPath(), 'utf8');
    draft(READING, [matching()]);
    const r = run({ checkOnly: true });
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
  });

  it('leaves the file byte-identical when there are no drafts, and keeps the formatting after a merge', () => {
    const original = readFileSync(seedPath(), 'utf8');
    mkdirSync(join(work, STEM), { recursive: true });
    expect(run().ok).toBe(true);
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
    draft(READING, [passage]);
    run();
    const after = readFileSync(seedPath(), 'utf8');
    expect(after).toBe(JSON.stringify(JSON.parse(after), null, 2) + '\n');
    const o = original.split('\n');
    const a = after.split('\n');
    expect(a.slice(0, 5)).toEqual(o.slice(0, 5));
    expect(a.length).toBeGreaterThan(o.length);
  });
});
