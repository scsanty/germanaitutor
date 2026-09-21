import type Database from 'better-sqlite3';
import type { GenerationAiClient } from './aiClient';
import type { Track, CefrLevel } from '../types';
import { getScopedTracks, getScopedLevels } from './scope';

interface RawLessonRef {
  lessonId: string;
}

interface RawNewLesson {
  slug: string;
  skill: string;
  title: string;
}

interface RawSection {
  slug: string;
  title: string;
  lessons: (RawLessonRef | { newLesson: RawNewLesson })[];
}

interface RawMilestone {
  slug: string;
  title: string;
  sections: RawSection[];
}

interface RawStructureResponse {
  milestones: RawMilestone[];
  overrideNeeded: { lessonId: string }[];
}

const SYSTEM_PROMPT =
  'You are an expert German-as-a-foreign-language curriculum designer, deeply familiar with CEFR, TELC, and Goethe-Institut exam formats.';

function buildUserPrompt(track: Track, level: CefrLevel, poolLessonIds: string[]): string {
  const trackGuidance =
    track === 'generic'
      ? 'This is the Generic track: use general CEFR "can-do" descriptors only, no specific exam format.'
      : `This is the ${track === 'telc' ? 'TELC' : 'Goethe-Institut'} exam track: ground the structure in that exam's real, documented format and syllabus for level ${level}, drawing on your training knowledge of it.`;
  return `Arrange a German-learning curriculum structure for CEFR level ${level}, track "${track}". ${trackGuidance}
Available shared concept pool for this level (reference by exact id): ${JSON.stringify(poolLessonIds)}.
Organize into Milestones, each containing Sections, each containing an ordered list of Lessons. A Lesson is either a reference to a pool concept ({"lessonId": "<id from the pool>"}) or, only when the exam format requires content not in the pool, a brand-new lesson ({"newLesson": {"slug": string, "skill": string, "title": string}}). A milestone should be a meaningful chunk of study, not a single lesson or an entire level.
Also list any pool concept (by id) that needs a track-specific explanation or exercise variant for this track, in "overrideNeeded".
Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{"milestones": [{"slug": string, "title": string, "sections": [{"slug": string, "title": string, "lessons": [{"lessonId": string} | {"newLesson": {"slug": string, "skill": string, "title": string}}]}]}], "overrideNeeded": [{"lessonId": string}]}`;
}

function isTrackLevelAlreadyGenerated(db: Database.Database, track: Track, level: CefrLevel): boolean {
  const row = db.prepare('SELECT 1 FROM milestones WHERE track = ? AND level = ? LIMIT 1').get(track, level);
  return row !== undefined;
}

function persistStructure(
  db: Database.Database,
  track: Track,
  level: CefrLevel,
  response: RawStructureResponse
): void {
  const insertMilestone = db.prepare(
    'INSERT OR IGNORE INTO milestones (id, track, level, title, order_index) VALUES (?, ?, ?, ?, ?)'
  );
  const insertSection = db.prepare(
    'INSERT OR IGNORE INTO sections (id, milestone_id, title, order_index) VALUES (?, ?, ?, ?)'
  );
  const insertNewLesson = db.prepare(
    'INSERT OR IGNORE INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)'
  );
  const insertPlacement = db.prepare(
    'INSERT OR IGNORE INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)'
  );
  const insertOverridePlaceholder = db.prepare(
    'INSERT OR IGNORE INTO lesson_track_overrides (lesson_id, track) VALUES (?, ?)'
  );

  const persist = db.transaction(() => {
    response.milestones.forEach((milestone, milestoneIndex) => {
      const milestoneId = `${track}-${level}-${milestone.slug}`.toLowerCase();
      insertMilestone.run(milestoneId, track, level, milestone.title, milestoneIndex);

      milestone.sections.forEach((section, sectionIndex) => {
        const sectionId = `${milestoneId}-${section.slug}`.toLowerCase();
        insertSection.run(sectionId, milestoneId, section.title, sectionIndex);

        section.lessons.forEach((lessonRef, lessonIndex) => {
          let lessonId: string;
          if ('newLesson' in lessonRef) {
            lessonId = `${track}-${level}-${lessonRef.newLesson.slug}`.toLowerCase();
            insertNewLesson.run(lessonId, level, lessonRef.newLesson.skill, lessonRef.newLesson.title);
          } else {
            lessonId = lessonRef.lessonId;
          }
          insertPlacement.run(lessonId, sectionId, lessonIndex);
        });
      });
    });

    for (const { lessonId } of response.overrideNeeded ?? []) {
      insertOverridePlaceholder.run(lessonId, track);
    }
  });
  persist();
}

export async function runPhase2(db: Database.Database, aiClient: GenerationAiClient): Promise<void> {
  for (const track of getScopedTracks()) {
    for (const level of getScopedLevels()) {
      if (isTrackLevelAlreadyGenerated(db, track, level)) continue;
      const poolLessonIds = (
        db.prepare('SELECT id FROM lessons WHERE source_level = ?').all(level) as { id: string }[]
      ).map((r) => r.id);
      const response = (await aiClient.generateJSON(
        SYSTEM_PROMPT,
        buildUserPrompt(track, level, poolLessonIds)
      )) as RawStructureResponse;
      if (!Array.isArray(response.milestones)) {
        throw new Error(`Phase 2 response for ${track}/${level} did not contain a "milestones" array`);
      }
      persistStructure(db, track, level, response);
    }
  }
}
