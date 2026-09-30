// Prints each seed file's lessons with skill, prerequisite depth and prerequisites, to help
// group them by difficulty. Run: npx tsx scripts/seed-report.ts [track-level ...]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'curriculum-seed');
const wanted = process.argv.slice(2);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  if (wanted.length > 0 && !wanted.includes(file.replace('.json', ''))) continue;
  const seed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const prereqs = new Map<string, string[]>();
  for (const p of seed.prerequisites) prereqs.set(p.lessonId, [...(prereqs.get(p.lessonId) ?? []), p.prerequisiteLessonId]);
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    if (!depth.has(id)) depth.set(id, Math.max(-1, ...(prereqs.get(id) ?? []).map(depthOf)) + 1);
    return depth.get(id)!;
  };
  const rows = seed.lessons
    .map((l: { id: string; skill: string; title: string; exercises?: unknown }) => ({
      depth: depthOf(l.id),
      skill: l.skill,
      id: l.id,
      title: l.title,
      exercises: seed.exercises.filter((e: { lessonId: string }) => e.lessonId === l.id).length,
      prereqs: (prereqs.get(l.id) ?? []).join(', '),
    }))
    .sort((a: { depth: number; id: string }, b: { depth: number; id: string }) => a.depth - b.depth || a.id.localeCompare(b.id));
  console.log(`\n=== ${file} (${rows.length} lessons)`);
  console.table(rows);
}
