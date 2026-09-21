import type Database from 'better-sqlite3';
import type { GenerationAiClient } from './aiClient';
import type { Track } from '../types';

interface RawExercise {
  slug: string;
  type: 'multiple_choice' | 'fill_blank' | 'flashcard' | 'free_text';
  content: unknown;
}

interface RawLessonContent {
  explanation: string;
  examples: string[];
  exercises: RawExercise[];
}

const SYSTEM_PROMPT = 'You are an expert German-as-a-foreign-language content writer.';

function buildLessonPrompt(skill: string, title: string): string {
  return `Write full content for a German-learning lesson on "${title}" (skill: ${skill}). Provide: a clear explanation of the concept, an array of example sentences (German, illustrating the concept), and 5-8 exercises drawn from these types as appropriate for the skill: multiple_choice ({"question","options","correctIndex"}), fill_blank ({"textWithBlank","correctAnswer","acceptableVariants"?}), flashcard ({"front","back"}), free_text ({"prompt","modelAnswer"}). Each exercise needs a unique short kebab-case slug. Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{"explanation": string, "examples": string[], "exercises": [{"slug": string, "type": "multiple_choice"|"fill_blank"|"flashcard"|"free_text", "content": object}]}`;
}

function buildOverridePrompt(skill: string, title: string, track: Track, canonicalExplanation: string): string {
  return `The German-learning lesson "${title}" (skill: ${skill}) normally reads: "${canonicalExplanation}". Write a ${track === 'telc' ? 'TELC' : track === 'goethe' ? 'Goethe-Institut' : track}-specific variant of this lesson's explanation, examples, and 5-8 exercises, reflecting how this exam track treats the concept differently. Same JSON shape as before:
{"explanation": string, "examples": string[], "exercises": [{"slug": string, "type": "multiple_choice"|"fill_blank"|"flashcard"|"free_text", "content": object}]}`;
}

function persistExercises(
  db: Database.Database,
  lessonId: string,
  track: Track | null,
  exercises: RawExercise[]
): void {
  const insertExercise = db.prepare(
    'INSERT OR IGNORE INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)'
  );
  for (const exercise of exercises) {
    const id = `${lessonId}-${exercise.slug}`.toLowerCase();
    insertExercise.run(id, lessonId, track, exercise.type, JSON.stringify(exercise.content));
  }
}

export async function runPhase3(db: Database.Database, aiClient: GenerationAiClient): Promise<void> {
  const pendingLessons = db
    .prepare('SELECT id, skill, title FROM lessons WHERE explanation IS NULL')
    .all() as { id: string; skill: string; title: string }[];

  for (const lesson of pendingLessons) {
    const content = (await aiClient.generateJSON(
      SYSTEM_PROMPT,
      buildLessonPrompt(lesson.skill, lesson.title)
    )) as RawLessonContent;
    if (typeof content.explanation !== 'string' || !Array.isArray(content.examples)) {
      throw new Error(`Phase 3 response for lesson ${lesson.id} missing explanation/examples`);
    }
    const update = db.transaction(() => {
      db.prepare('UPDATE lessons SET explanation = ?, examples = ? WHERE id = ?').run(
        content.explanation,
        JSON.stringify(content.examples),
        lesson.id
      );
      persistExercises(db, lesson.id, null, content.exercises ?? []);
    });
    update();
  }

  const pendingOverrides = db
    .prepare(
      `SELECT lesson_track_overrides.lesson_id as lessonId, lesson_track_overrides.track as track,
              lessons.skill as skill, lessons.title as title, lessons.explanation as canonicalExplanation
       FROM lesson_track_overrides
       JOIN lessons ON lessons.id = lesson_track_overrides.lesson_id
       WHERE lesson_track_overrides.explanation IS NULL`
    )
    .all() as { lessonId: string; track: Track; skill: string; title: string; canonicalExplanation: string }[];

  for (const override of pendingOverrides) {
    const content = (await aiClient.generateJSON(
      SYSTEM_PROMPT,
      buildOverridePrompt(override.skill, override.title, override.track, override.canonicalExplanation)
    )) as RawLessonContent;
    if (typeof content.explanation !== 'string' || !Array.isArray(content.examples)) {
      throw new Error(`Phase 3 override response for ${override.lessonId}/${override.track} missing fields`);
    }
    const update = db.transaction(() => {
      db.prepare(
        'UPDATE lesson_track_overrides SET explanation = ?, examples = ? WHERE lesson_id = ? AND track = ?'
      ).run(content.explanation, JSON.stringify(content.examples), override.lessonId, override.track);
      persistExercises(db, override.lessonId, override.track, content.exercises ?? []);
    });
    update();
  }
}
