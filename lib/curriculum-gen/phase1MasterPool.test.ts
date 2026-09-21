import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runPhase1 } from './phase1MasterPool';

describe('runPhase1', () => {
  it('persists concepts and prerequisites for every level', async () => {
    const db = createDbClient(':memory:');
    const generateJSON = vi.fn().mockResolvedValue({
      concepts: [
        { slug: 'personal-pronouns', skill: 'grammar', title: 'Personal pronouns', prerequisiteSlugs: [] },
        {
          slug: 'present-tense-regular',
          skill: 'grammar',
          title: 'Present tense',
          prerequisiteSlugs: ['personal-pronouns'],
        },
      ],
    });
    await runPhase1(db, { generateJSON });

    expect(generateJSON).toHaveBeenCalledTimes(5); // A1-C1
    const lessons = db.prepare('SELECT id, source_level FROM lessons').all();
    expect(lessons).toHaveLength(10); // 2 concepts x 5 levels

    const prereqs = db
      .prepare('SELECT * FROM lesson_prerequisites WHERE lesson_id = ?')
      .all('a1-present-tense-regular');
    expect(prereqs).toEqual([{ lesson_id: 'a1-present-tense-regular', prerequisite_lesson_id: 'a1-personal-pronouns' }]);
  });

  it('is resumable: skips a level that already has lessons', async () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO lessons (id, source_level, skill, title) VALUES ('a1-existing', 'A1', 'grammar', 'Existing')`);
    const generateJSON = vi.fn().mockResolvedValue({ concepts: [] });
    await runPhase1(db, { generateJSON });
    expect(generateJSON).toHaveBeenCalledTimes(4); // A2-C1, A1 skipped
  });
});
