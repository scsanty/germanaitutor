import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from './curriculumSeedLoader';
import { validatePlacementExam } from '../tutoring/placementExamFormat';

const DIR = join(process.cwd(), 'data', 'curriculum-seed');
const seeds = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(DIR, f), 'utf8')) as SeedFile] as const);

// Quoted German inside an English example ('…' or „…“) must reappear unchanged in its German version.
function quotedSegments(text: string): string[] {
  return [...text.matchAll(/'([^']{4,})'|„([^“]{4,})“/g)].map((m) => m[1] ?? m[2]);
}

describe('bundled German content', () => {
  it.each(seeds)('%s: is seed version 6', (_f, seed) => {
    expect(seed.seedVersion).toBe('7');
  });

  it.each(seeds)('%s: has real German titles, descriptions and explanations (not English copies)', (_f, seed) => {
    for (const { milestone } of seed.milestones) expect(milestone.titleDe).not.toBe(milestone.title);
    const translatedTitles = seed.lessons.filter((l) => l.titleDe !== l.title).length;
    // Some titles are the same in both languages ("Perfekt"); nearly all are not.
    expect(translatedTitles / seed.lessons.length).toBeGreaterThanOrEqual(0.9);
    for (const lesson of seed.lessons) {
      if (lesson.explanation) expect(lesson.explanationDe).not.toBe(lesson.explanation);
    }
  });

  it.each(seeds)('%s: keeps quoted German passages unchanged in German examples', (_f, seed) => {
    for (const lesson of seed.lessons) {
      (lesson.examples ?? []).forEach((example, i) => {
        for (const segment of quotedSegments(example)) expect(lesson.examplesDe![i]).toContain(segment);
      });
    }
  });

  it('keeps the placement exam valid, with instructions where it had English task text', () => {
    const exam = JSON.parse(readFileSync(join(process.cwd(), 'data', 'placement-exam.json'), 'utf8'));
    expect(validatePlacementExam(exam)).toMatchObject({ ok: true });
  });
});
