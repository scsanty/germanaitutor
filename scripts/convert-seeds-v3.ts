// One-off (Bilingual Content, Task 2): seed format v2 → v3. German fields start as copies of the
// English so the app keeps loading; Task 6 replaces them with the real German draft.
// Run: npx tsx scripts/convert-seeds-v3.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'curriculum-seed');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, file);
  const seed = JSON.parse(readFileSync(path, 'utf8'));
  if (seed.formatVersion === 3) continue;
  seed.formatVersion = 3;
  seed.seedVersion = '5';
  for (const entry of seed.milestones) {
    entry.milestone.titleDe = entry.milestone.title;
    entry.milestone.descriptionDe = entry.milestone.description;
  }
  for (const lesson of seed.lessons) {
    lesson.titleDe = lesson.title;
    lesson.explanationDe = lesson.explanation;
    lesson.examplesDe = lesson.examples;
  }
  writeFileSync(path, JSON.stringify(seed, null, 2) + '\n');
  console.log(`converted ${file}`);
}
