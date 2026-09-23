import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createConceptLinkService } from './conceptLinkService';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, track: string, level = 'A1') {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, 'grammar', ?)`).run(
    id,
    track,
    level,
    id
  );
}

describe('conceptLinkService', () => {
  it('links two lessons in different tracks at the same level', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);

    service.addLink('g1', 't1');

    const links = service.getLinksForLesson('g1');
    expect(links).toHaveLength(1);
    expect([links[0].lessonAId, links[0].lessonBId].sort()).toEqual(['g1', 't1']);
  });

  it('stores the pair canonically regardless of argument order', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);

    service.addLink('t1', 'g1');

    const row = db.prepare('SELECT lesson_a_id, lesson_b_id FROM lesson_concept_links').get() as {
      lesson_a_id: string;
      lesson_b_id: string;
    };
    expect(row).toEqual({ lesson_a_id: 'g1', lesson_b_id: 't1' });
  });

  it('rejects linking two lessons in the same track', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 'g2', 'generic');
    const service = createConceptLinkService(db);
    expect(() => service.addLink('g1', 'g2')).toThrow();
  });

  it('rejects linking lessons at different levels', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic', 'A1');
    insertLesson(db, 't1', 'telc', 'A2');
    const service = createConceptLinkService(db);
    expect(() => service.addLink('g1', 't1')).toThrow();
  });

  it('rejects a duplicate link', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);
    service.addLink('g1', 't1');
    expect(() => service.addLink('t1', 'g1')).toThrow();
  });

  it('removeLink deletes the pair regardless of argument order', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);
    service.addLink('g1', 't1');

    service.removeLink('t1', 'g1');

    expect(service.getLinksForLesson('g1')).toEqual([]);
  });

  it('getLinksForLesson only returns links directly touching that lesson', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    insertLesson(db, 'go1', 'goethe');
    const service = createConceptLinkService(db);
    service.addLink('g1', 't1');
    service.addLink('g1', 'go1');

    expect(service.getLinksForLesson('t1')).toHaveLength(1);
    expect(service.getLinksForLesson('g1')).toHaveLength(2);
  });
});
