import { describe, it, expect } from 'vitest';
import { formatProblems, listFormats } from '@/lib/exam/formats';

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
});
