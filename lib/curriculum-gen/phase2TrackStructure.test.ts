import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runPhase2 } from './phase2TrackStructure';

function seedPool(db: ReturnType<typeof createDbClient>) {
  db.exec(
    `INSERT INTO lessons (id, source_level, skill, title) VALUES ('a1-present-tense-regular', 'A1', 'grammar', 'Present tense')`
  );
}

describe('runPhase2', () => {
  it('persists milestones, sections, placements, new lessons, and override placeholders', async () => {
    const db = createDbClient(':memory:');
    seedPool(db);
    const generateJSON = vi.fn().mockResolvedValue({
      milestones: [
        {
          slug: 'm1',
          title: 'Milestone 1',
          sections: [
            {
              slug: 's1',
              title: 'Section 1',
              lessons: [
                { lessonId: 'a1-present-tense-regular' },
                { newLesson: { slug: 'formal-letter-format', skill: 'writing', title: 'Formal letter format' } },
              ],
            },
          ],
        },
      ],
      overrideNeeded: [{ lessonId: 'a1-present-tense-regular' }],
    });
    await runPhase2(db, { generateJSON });

    expect(generateJSON).toHaveBeenCalledTimes(15); // 3 tracks x 5 levels
    const milestones = db.prepare('SELECT id FROM milestones').all();
    expect(milestones.length).toBeGreaterThan(0);
    const newLesson = db.prepare("SELECT * FROM lessons WHERE id LIKE '%formal-letter-format'").all();
    expect(newLesson.length).toBeGreaterThan(0);
    const overrides = db.prepare('SELECT * FROM lesson_track_overrides WHERE lesson_id = ?').all('a1-present-tense-regular');
    expect(overrides.length).toBe(3); // one per track that saw this response shape
  });

  it('is resumable: skips a track/level that already has milestones', async () => {
    const db = createDbClient(':memory:');
    seedPool(db);
    db.exec(
      `INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-existing', 'generic', 'A1', 'Existing', 0)`
    );
    const generateJSON = vi.fn().mockResolvedValue({ milestones: [], overrideNeeded: [] });
    await runPhase2(db, { generateJSON });
    expect(generateJSON).toHaveBeenCalledTimes(14); // generic/A1 skipped
  });
});
