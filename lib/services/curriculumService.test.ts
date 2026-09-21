import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumService } from './curriculumService';

function seedBasicTree(db: ReturnType<typeof createDbClient>) {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-m1', 'generic', 'A1', 'Basics', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('generic-a1-m1-s1', 'generic-a1-m1', 'Greetings', 0);
    INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES
      ('a1-present-tense-regular', 'A1', 'grammar', 'Present tense of regular verbs', 'Canonical explanation', '["ich lerne"]');
    INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-present-tense-regular', 'generic-a1-m1-s1', 0);
    INSERT INTO exercises (id, lesson_id, track, type, content) VALUES
      ('a1-present-tense-regular-mc-1', 'a1-present-tense-regular', NULL, 'multiple_choice', '{"question":"q","options":["a","b"],"correctIndex":0}');
  `);
}

describe('curriculumService', () => {
  it('lists tracks with their levels', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    expect(service.listTracks()).toEqual([{ track: 'generic', levels: ['A1'] }]);
  });

  it('returns a track structure with nested sections and lessons', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const structure = service.getTrackStructure('generic', 'A1');
    expect(structure).toHaveLength(1);
    expect(structure[0].sections[0].lessons[0].id).toBe('a1-present-tense-regular');
  });

  it('falls back to canonical lesson content when no track override exists', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const lesson = service.getLesson('a1-present-tense-regular', 'telc');
    expect(lesson?.explanation).toBe('Canonical explanation');
  });

  it('uses a track override when one exists', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    db.exec(
      `INSERT INTO lesson_track_overrides (lesson_id, track, explanation, examples) VALUES ('a1-present-tense-regular', 'telc', 'TELC-specific explanation', '["telc example"]')`
    );
    const service = createCurriculumService(db);
    const lesson = service.getLesson('a1-present-tense-regular', 'telc');
    expect(lesson?.explanation).toBe('TELC-specific explanation');
  });

  it('falls back to shared exercises when no track-specific exercises exist', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const exercises = service.getExercises('a1-present-tense-regular', 'telc');
    expect(exercises).toHaveLength(1);
    expect(exercises[0].track).toBeNull();
  });

  it('prefers track-specific exercises over shared ones', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    db.exec(
      `INSERT INTO exercises (id, lesson_id, track, type, content) VALUES ('a1-present-tense-regular-telc-mc-1', 'a1-present-tense-regular', 'telc', 'multiple_choice', '{"question":"telc q","options":["a","b"],"correctIndex":1}')`
    );
    const service = createCurriculumService(db);
    const exercises = service.getExercises('a1-present-tense-regular', 'telc');
    expect(exercises).toHaveLength(1);
    expect(exercises[0].track).toBe('telc');
  });
});
