import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumService } from './curriculumService';

function seedBasicTree(db: ReturnType<typeof createDbClient>) {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-m1', 'generic', 'A1', 'Basics', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('generic-a1-m1-s1', 'generic-a1-m1', 'Greetings', 0);
    INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES
      ('a1-present-tense-regular', 'generic', 'A1', 'grammar', 'Present tense of regular verbs', 'Canonical explanation', '["ich lerne"]');
    INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-present-tense-regular', 'generic-a1-m1-s1', 0);
    INSERT INTO exercises (id, lesson_id, track, type, content) VALUES
      ('a1-present-tense-regular-mc-1', 'a1-present-tense-regular', 'generic', 'multiple_choice', '{"question":"q","options":["a","b"],"correctIndex":0}');
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
    expect(structure).toHaveLength(2);
    expect(structure[0].sections[0].lessons[0].id).toBe('a1-present-tense-regular');
  });

  it('ensures Unsorted exists and always sorts it last, regardless of order_index', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-late', 'generic', 'A1', 'Late', 99);
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-early', 'generic', 'A1', 'Early', 0);
    `);
    const service = createCurriculumService(db);
    const structure = service.getTrackStructure('generic', 'A1');
    const titles = structure.map((s) => s.milestone.title);
    expect(titles).toEqual(['Early', 'Late', 'Unsorted']);
  });

  it('returns a lesson with its own track', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const lesson = service.getLesson('a1-present-tense-regular', 'generic');
    expect(lesson?.explanation).toBe('Canonical explanation');
    expect(lesson?.track).toBe('generic');
  });

  it('returns null for a lesson that does not exist', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    expect(service.getLesson('does-not-exist', 'generic')).toBeNull();
  });

  it('returns all exercises for a lesson', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const exercises = service.getExercises('a1-present-tense-regular', 'generic');
    expect(exercises).toHaveLength(1);
    expect(exercises[0].id).toBe('a1-present-tense-regular-mc-1');
  });
});
