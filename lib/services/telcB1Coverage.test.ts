import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from './curriculumSeedLoader';

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), 'utf8'));
const inventory = read('data', 'inventory', 'b1.json') as { id: string; kind: string; label: string; labelDe: string }[];
const coverage = read('data', 'inventory', 'telc-b1-coverage.json') as Record<string, string[]> & { _new?: string[] };
const seed = read('data', 'curriculum-seed', 'telc-b1.json') as SeedFile;
const lessonIds = new Set(seed.lessons.map((l) => l.id));
const newIds = coverage._new ?? [];

describe('telc B1 coverage', () => {
  it('has the 61 inventory items with unique ids and both labels', () => {
    expect(inventory).toHaveLength(61);
    expect(new Set(inventory.map((i) => i.id)).size).toBe(61);
    for (const item of inventory) {
      expect(item.label.trim()).not.toBe('');
      expect(item.labelDe.trim()).not.toBe('');
    }
  });

  it('has exactly one coverage entry per inventory item', () => {
    expect(Object.keys(coverage).filter((k) => k !== '_new').sort()).toEqual(inventory.map((i) => i.id).sort());
  });

  it('maps only real telc B1 lessons, and every telc B1 lesson to at least one item', () => {
    const mapped = new Set(Object.entries(coverage).filter(([k]) => k !== '_new').flatMap(([, ids]) => ids));
    for (const id of mapped) expect(lessonIds.has(id), id).toBe(true);
    for (const id of lessonIds) expect(mapped.has(id), `${id} is not mapped to any item`).toBe(true);
  });

  it('keeps new lessons well-formed', () => {
    for (const id of newIds) {
      const lesson = seed.lessons.find((l) => l.id === id);
      expect(lesson, id).toBeDefined();
      expect(id.startsWith('b1-telc-')).toBe(true);
      const exercises = seed.exercises.filter((e) => e.lessonId === id);
      expect(exercises.length, `${id} exercise count`).toBeGreaterThanOrEqual(4);
      expect(exercises.length, `${id} exercise count`).toBeLessThanOrEqual(8);
      if (lesson!.skill !== 'vocabulary') expect(exercises.some((e) => e.type === 'flashcard'), `${id} flashcards`).toBe(false);
      for (const e of exercises.filter((x) => x.type === 'multiple_choice')) {
        const c = e.content as { options: string[]; correctIndex: number };
        expect(c.correctIndex >= 0 && c.correctIndex < c.options.length, e.id).toBe(true);
      }
    }
  });

  it('covers every inventory item', () => {
    for (const item of inventory) expect(coverage[item.id]?.length ?? 0, item.id).toBeGreaterThan(0);
  });

  it('lists every concept link in both files it touches', () => {
    const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'curriculum-seed', f), 'utf8')) as SeedFile;
    const files = ['telc-b1.json', 'goethe-b1.json', 'generic-b1.json'].map(read);
    const owner = new Map<string, number>();
    files.forEach((f, i) => f.lessons.forEach((l) => owner.set(l.id, i)));
    files.forEach((f, i) => {
      for (const link of f.conceptLinks ?? []) {
        for (const end of [link.lessonAId, link.lessonBId]) {
          const other = owner.get(end);
          if (other === undefined || other === i) continue;
          const listed = (files[other].conceptLinks ?? []).some((x) => x.lessonAId === link.lessonAId && x.lessonBId === link.lessonBId);
          expect(listed, `${link.lessonAId} ↔ ${link.lessonBId} missing in the other file`).toBe(true);
        }
      }
    });
  });
});
