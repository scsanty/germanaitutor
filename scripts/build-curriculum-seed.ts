import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Track, CefrLevel } from '../lib/types';
import type { Skill } from '../lib/curriculum/types';

/**
 * Converts the human-authored curriculum YAML files in `curricula/` into the seed JSON
 * format consumed by `loadSeedIfNeeded` (see lib/services/curriculumSeedLoader.ts).
 *
 * Each YAML file is a flat, track-agnostic list of lessons for one track+level (no
 * milestone/section grouping — see docs/curriculum-content-authoring-prompt.md). This
 * script imports every lesson as its own independent row (own track, own explanation,
 * own examples, own exercises) and groups them into one milestone per skill (in a fixed
 * order) with a single section each, preserving each lesson's position within its YAML
 * file. This is placeholder structure only: refining milestones/sections into more
 * pedagogically meaningful groupings, and linking cross-track equivalents via
 * `concept_id`, is deferred to the future /admin/curriculum merge UI — every lesson here
 * is imported with `conceptId: null`.
 */

const SEED_VERSION = '2';
const SKILL_ORDER: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];
const SKILL_TITLES: Record<Skill, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
};

interface YamlExercise {
  type: string;
  [key: string]: unknown;
}

interface YamlLesson {
  slug: string;
  skill: Skill;
  title: string;
  prerequisites: string[];
  explanation: string | null;
  examples: string[] | null;
  exercises: YamlExercise[] | null;
}

interface YamlCurriculum {
  track: Track;
  level: CefrLevel;
  lessons: YamlLesson[];
}

function exerciseContent(exercise: YamlExercise): unknown {
  const { type, ...content } = exercise;
  return content;
}

/**
 * A lesson slug is only guaranteed unique within its own YAML file (one track+level).
 * Three slugs across these 15 files are reused for a genuinely different lesson at a
 * different level of the same track (e.g. `telc-reading-teil3-classifieds-matching`
 * exists as separate A2 and B1 lessons) — since `lessons.id` is a single global primary
 * key, importing both under the bare slug would silently overwrite one with the other.
 * Namespacing every id by level guarantees uniqueness without needing to know which
 * slugs happen to collide.
 */
function lessonDbId(level: CefrLevel, slug: string): string {
  return `${level.toLowerCase()}-${slug}`;
}

function buildSeedFile(yamlPath: string): object {
  const parsed = parse(readFileSync(yamlPath, 'utf8')) as YamlCurriculum;
  const { track, level, lessons } = parsed;

  const lessonsBySkill = new Map<Skill, YamlLesson[]>();
  for (const lesson of lessons) {
    const bucket = lessonsBySkill.get(lesson.skill) ?? [];
    bucket.push(lesson);
    lessonsBySkill.set(lesson.skill, bucket);
  }

  const levelSlug = level.toLowerCase();
  const milestones = SKILL_ORDER.filter((skill) => (lessonsBySkill.get(skill)?.length ?? 0) > 0).map(
    (skill, milestoneIndex) => {
      const milestoneId = `${track}-${levelSlug}-${skill}`;
      const sectionId = `${milestoneId}-lessons`;
      const skillLessons = lessonsBySkill.get(skill)!;
      return {
        milestone: {
          id: milestoneId,
          track,
          level,
          title: SKILL_TITLES[skill],
          description: null,
          orderIndex: milestoneIndex,
        },
        sections: [
          {
            section: { id: sectionId, milestoneId, title: 'Lessons', description: null, orderIndex: 0 },
            lessonRefs: skillLessons.map((lesson, i) => ({ lessonId: lessonDbId(level, lesson.slug), orderIndex: i })),
          },
        ],
      };
    }
  );

  const seedLessons = lessons.map((lesson) => ({
    id: lessonDbId(level, lesson.slug),
    track,
    conceptId: null as string | null,
    sourceLevel: level,
    skill: lesson.skill,
    title: lesson.title,
    explanation: lesson.explanation,
    examples: lesson.examples,
  }));

  const exercises = lessons.flatMap((lesson) =>
    (lesson.exercises ?? []).map((exercise, i) => ({
      id: `${lessonDbId(level, lesson.slug)}__ex${i}`,
      lessonId: lessonDbId(level, lesson.slug),
      track,
      type: exercise.type,
      content: exerciseContent(exercise),
    }))
  );

  const prerequisites = lessons.flatMap((lesson) =>
    (lesson.prerequisites ?? []).map((prerequisiteSlug) => ({
      lessonId: lessonDbId(level, lesson.slug),
      // Prerequisites only ever reference other slugs within the same YAML file (see
      // docs/curriculum-content-authoring-prompt.md rule 2), so they share this lesson's level.
      prerequisiteLessonId: lessonDbId(level, prerequisiteSlug),
    }))
  );

  return { seedVersion: SEED_VERSION, track, level, milestones, lessons: seedLessons, exercises, prerequisites };
}

function main(): void {
  const curriculaDir = join(process.cwd(), 'curricula');
  const outDir = join(process.cwd(), 'data', 'curriculum-seed');

  const files = readdirSync(curriculaDir).filter((f) => f.endsWith('.yaml') && !f.startsWith('._'));
  if (files.length === 0) {
    throw new Error(`No .yaml files found in ${curriculaDir}`);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const seed = buildSeedFile(join(curriculaDir, file)) as { track: Track; level: CefrLevel };
    const outName = `${seed.track}-${seed.level.toLowerCase()}.json`;
    writeFileSync(join(outDir, outName), JSON.stringify(seed, null, 2));
    console.log(`Wrote ${outName}`);
  }

  console.log(`\nDone. ${files.length} seed files written to ${outDir}`);
}

main();
