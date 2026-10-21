import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createErrorLogService } from '@/lib/services/errorLogService';
import { createProfileService } from '@/lib/services/profileService';
import { GET } from './route';

describe('/api/tutoring/mistakes', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-mistakes-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns no items when nothing was logged', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  function seed() {
    const db = getDb();
    db.exec(`INSERT INTO milestones (id, track, level, title, title_de, difficulty_rank) VALUES
        ('m-a1', 'generic', 'A1', 'M', 'M', 1), ('m-b1', 'generic', 'B1', 'N', 'N', 1);
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES
        ('adj', 'generic', 'A1', 'grammar', 'Adjective endings', 'Adjektivendungen'),
        ('acc', 'generic', 'B1', 'grammar', 'The accusative case', 'Der Akkusativ');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('adj', 'm-a1'), ('acc', 'm-b1');`);
    createErrorLogService(db).record('teil', [
      { category: 'adjective_endings', wrong: 'ein gute Idee', right: 'eine gute Idee' },
      { category: 'adjective_endings', wrong: 'mit gute Freunden', right: 'mit guten Freunden' },
      { category: 'case_objects', wrong: 'ich sehe der Mann', right: 'ich sehe den Mann' },
      { category: 'register', wrong: 'hey', right: 'Sehr geehrte Damen' },
    ]);
    return db;
  }

  type Item = { categoryId: string; label: unknown; count: number; example: unknown; lesson: { id: string; title: string } | null; drillTopic: string | null };
  const items = async () => ((await (await GET()).json()) as { items: Item[] }).items;
  const byId = (list: Item[], id: string) => list.find((i) => i.categoryId === id)!;

  it('returns label, count, example and the matching lesson in the active track and level', async () => {
    seed();
    const list = await items();
    expect(list[0]).toMatchObject({
      categoryId: 'adjective_endings',
      label: { en: 'Adjective endings', de: 'Adjektivendungen' },
      count: 2,
      example: { wrong: 'mit gute Freunden', right: 'mit guten Freunden' },
      lesson: { id: 'adj', title: 'Adjective endings' },
      drillTopic: null,
    });
  });

  it('gives the lesson title in German when the UI language is German', async () => {
    const db = seed();
    createProfileService(db).getProfile(); // creates the profile row
    db.prepare("UPDATE profile SET ui_language = 'de'").run();
    expect(byId(await items(), 'adjective_endings').lesson).toEqual({ id: 'adj', title: 'Adjektivendungen' });
  });

  it('offers a grammar lesson title from another level as the drill topic when the active level has no match', async () => {
    seed();
    const accusative = byId(await items(), 'case_objects');
    expect(accusative.lesson).toBeNull();
    expect(accusative.drillTopic).toBe('The accusative case');
    getDb().prepare("UPDATE profile SET ui_language = 'de'").run();
    expect(byId(await items(), 'case_objects').drillTopic).toBe('Der Akkusativ');
  });

  it('falls back to the German category label as the drill topic when no lesson matches anywhere', async () => {
    seed();
    const register = byId(await items(), 'register');
    expect(register.lesson).toBeNull();
    expect(register.drillTopic).toBe((register.label as { de: string }).de);
  });
});
