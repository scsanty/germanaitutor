// One-off (Curriculum Restructure, Task 2): converts the bundled v1 seeds (milestones →
// sections → lessonRefs) to format v2 (ranked milestones → lessonIds), keeping the grouping.
// Run: npx tsx scripts/convert-seeds-v2.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'curriculum-seed');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, file);
  const v1 = JSON.parse(readFileSync(path, 'utf8'));
  if (v1.formatVersion === 2) continue;
  const milestones = [...v1.milestones]
    .sort((a, b) => a.milestone.orderIndex - b.milestone.orderIndex)
    .map((entry: any, index: number) => ({
      milestone: {
        id: entry.milestone.id,
        track: entry.milestone.track,
        level: entry.milestone.level,
        title: entry.milestone.title,
        description: entry.milestone.description,
        difficultyRank: index + 1,
      },
      lessonIds: [...entry.sections]
        .sort((a: any, b: any) => a.section.orderIndex - b.section.orderIndex)
        .flatMap((s: any) => [...s.lessonRefs].sort((a: any, b: any) => a.orderIndex - b.orderIndex).map((r: any) => r.lessonId)),
    }));
  const { milestones: _old, seedVersion: _v, ...rest } = v1;
  const v2 = { seedVersion: '3', formatVersion: 2, ...rest, milestones };
  writeFileSync(path, JSON.stringify(v2, null, 2) + '\n');
  console.log(`converted ${file}`);
}
