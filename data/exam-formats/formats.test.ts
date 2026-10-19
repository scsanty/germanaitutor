import { describe, it, expect } from 'vitest';
import { formatProblems, listFormats } from '@/lib/exam/formats';
import { rubricMaxPoints, rubricProblems } from '@/lib/writing/rubric';

const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'];
const IDS = ['generic', 'goethe', 'telc'].flatMap((track) => LEVELS.map((level) => `${track}-${level}`));

describe('bundled exam formats', () => {
  it('are all valid', () => {
    const formats = listFormats();
    expect(formats.length).toBeGreaterThan(0);
    for (const f of formats) expect(formatProblems(f), f.id).toEqual([]);
  });

  it('cover all 15 track+levels', () => {
    expect(listFormats().map((f) => f.id)).toEqual(IDS);
  });

  it('name their own track and level, and put every part in exactly one block', () => {
    for (const f of listFormats()) {
      expect(`${f.track}-${f.level.toLowerCase()}`, f.id).toBe(f.id);
      expect(f.sources.length > 0, f.id).toBe(f.track !== 'generic');
      const placed = f.blocks.flatMap((b) => b.partIds).sort();
      expect(placed, f.id).toEqual(f.parts.map((p) => p.id).sort());
      for (const b of f.blocks) expect(b.passRatio, `${f.id}/${b.id}`).toBe(0.6);
      for (const p of f.parts) expect(p.instructions.length, `${f.id}/${p.id}`).toBeGreaterThan(20);
    }
  });

  // Practice runs one part on its own and numbers its items from 1, with no example item,
  // so the instructions shown above it must not cite exam-wide numbers or an example.
  it('use practice-local item numbers and never mention an example item', () => {
    const range = /(Aufgaben?|Lücken?|Texte|Situationen|Aussagen?|Fragen|Überschriften|Paragraphen|Zeilen)\s+(\d+)\s*(bis|–|-)\s*\d+/g;
    for (const f of listFormats()) {
      for (const p of f.parts) {
        const where = `${f.id}/${p.id}: ${p.instructions}`;
        for (const m of p.instructions.matchAll(range)) expect(Number(m[2]), where).toBe(1);
        expect(p.instructions, where).not.toContain('Beispiel');
      }
    }
  });

  it('gives every listening part one or two plays', () => {
    const listening = listFormats().flatMap((f) => f.parts.filter((p) => p.taskType === 'audio_questions').map((p) => [f, p] as const));
    expect(listening.length).toBeGreaterThan(0);
    for (const [f, p] of listening) expect([1, 2], `${f.id}/${p.id}`).toContain(p.replays);
  });

  it('gives the NaDoch formats a 100-point written and a 50-point oral block', () => {
    for (const f of listFormats().filter((x) => x.track === 'generic')) {
      const sum = (id: string) => f.blocks.find((b) => b.id === id)!.partIds.reduce((s, pid) => s + f.parts.find((p) => p.id === pid)!.points, 0);
      expect([sum('written'), sum('oral')], f.id).toEqual([100, 50]);
    }
  });

  // A letter part without a rubric has no runner, so none may stay unrunnable unnoticed.
  it('gives every letter part a valid rubric, a word target and a choice count', () => {
    const letters = listFormats().flatMap((f) => f.parts.filter((p) => p.taskType === 'letter').map((p) => [f, p] as const));
    expect(letters.length).toBe(22);
    for (const [f, p] of letters) {
      const where = `${f.id}/${p.id}`;
      expect(p.rubric, where).toBeDefined();
      expect(rubricProblems(p.rubric!), where).toEqual([]);
      expect(rubricMaxPoints(p.rubric!), where).toBe(p.points);
      expect(p.items, where).toBe(p.rubric!.criteria.length);
      expect(p.wordTarget!.min, where).toBeGreaterThan(0);
      expect(p.wordTarget!.max, where).toBeGreaterThan(p.wordTarget!.min);
      expect([1, 2], where).toContain(p.choices);
    }
  });

  // telc B1, B2 and C1 offer two tasks to choose from; every other letter part has one.
  it('offers a choice of two tasks only in telc B1, B2 and C1', () => {
    const two = listFormats().flatMap((f) => f.parts.filter((p) => p.taskType === 'letter' && p.choices === 2).map((p) => `${f.id}/${p.id}`));
    expect(two).toEqual(['telc-b1/schreiben', 'telc-b2/schreiben', 'telc-c1/schreiben']);
  });

  // The anchors grade cohesion and connectors, so the rubric's text-design criterion must name them too.
  it('names cohesion and connectors in every letter rubric', () => {
    for (const f of listFormats()) {
      for (const p of f.parts.filter((x) => x.taskType === 'letter')) {
        const design = p.rubric!.criteria.filter((c) => c.id === 'gestaltung' || c.id === 'kohaerenz');
        expect(design.length, `${f.id}/${p.id}`).toBe(1);
        const text = Object.values(design[0].descriptors).join(' ');
        expect(text, `${f.id}/${p.id}`).toContain("Konnektoren");
      }
    }
  });

  it('keeps the three form-filling parts as typed cloze parts with no rubric', () => {
    for (const [fid, pid] of [['goethe-a1', 'schreiben-1'], ['telc-a1', 'schreiben-1'], ['telc-a2', 'schreiben-1']]) {
      const p = listFormats().find((f) => f.id === fid)!.parts.find((x) => x.id === pid)!;
      expect([p.skill, p.taskType, p.items, p.points, p.rubric, p.wordTarget], `${fid}/${pid}`).toEqual(['writing', 'cloze', 5, 5, undefined, undefined]);
    }
  });
});
