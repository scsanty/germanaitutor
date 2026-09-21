import type Database from 'better-sqlite3';
import type { GenerationAiClient } from './aiClient';
import type { CefrLevel } from '../types';
import type { Skill } from '../curriculum/types';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

interface RawConcept {
  slug: string;
  skill: string;
  title: string;
  prerequisiteSlugs: string[];
}

const SYSTEM_PROMPT =
  'You are an expert German-as-a-foreign-language curriculum designer, deeply familiar with the CEFR framework.';

function buildUserPrompt(level: CefrLevel): string {
  return `Design the master concept pool for CEFR level ${level} German language learning content, covering all six skill areas: ${SKILLS.join(
    ', '
  )}. List every concept a learner at this level should master, grounded in official CEFR "can-do" descriptors for ${level}. For each concept, give: a short kebab-case slug (unique within this level, no level prefix), the skill it belongs to, a short human-readable title, and an array of prerequisite slugs referencing EARLIER concepts in this same list that this one depends on (omit if none). Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{"concepts": [{"slug": string, "skill": "grammar"|"vocabulary"|"reading"|"listening"|"writing"|"speaking", "title": string, "prerequisiteSlugs": string[]}]}`;
}

function isLevelAlreadyGenerated(db: Database.Database, level: CefrLevel): boolean {
  const row = db.prepare('SELECT 1 FROM lessons WHERE source_level = ? LIMIT 1').get(level);
  return row !== undefined;
}

function persistConcepts(db: Database.Database, level: CefrLevel, concepts: RawConcept[]): void {
  const insertLesson = db.prepare(
    'INSERT OR IGNORE INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)'
  );
  const insertPrerequisite = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );
  const persist = db.transaction((items: RawConcept[]) => {
    for (const concept of items) {
      const id = `${level}-${concept.slug}`.toLowerCase();
      insertLesson.run(id, level, concept.skill, concept.title);
    }
    for (const concept of items) {
      const id = `${level}-${concept.slug}`.toLowerCase();
      for (const prereqSlug of concept.prerequisiteSlugs) {
        insertPrerequisite.run(id, `${level}-${prereqSlug}`.toLowerCase());
      }
    }
  });
  persist(concepts);
}

export async function runPhase1(db: Database.Database, aiClient: GenerationAiClient): Promise<void> {
  for (const level of LEVELS) {
    if (isLevelAlreadyGenerated(db, level)) continue;
    const response = (await aiClient.generateJSON(SYSTEM_PROMPT, buildUserPrompt(level))) as {
      concepts: RawConcept[];
    };
    if (!Array.isArray(response.concepts)) {
      throw new Error(`Phase 1 response for level ${level} did not contain a "concepts" array`);
    }
    persistConcepts(db, level, response.concepts);
  }
}
