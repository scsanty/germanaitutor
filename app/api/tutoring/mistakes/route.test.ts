import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createErrorLogService } from '@/lib/services/errorLogService';
import { TAXONOMY } from '@/lib/errors/taxonomy';
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

  it('returns the top categories with label, count, example and a lesson slot', async () => {
    const [first, second] = TAXONOMY;
    const log = createErrorLogService(getDb());
    log.record('teil', [
      { category: first.id, wrong: 'ich bin gehen', right: 'ich gehe' },
      { category: first.id, wrong: 'er sind', right: 'er ist' },
      { category: second.id, wrong: 'dem Tisch', right: 'den Tisch' },
    ]);
    const body = (await (await GET()).json()) as { items: Record<string, unknown>[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      categoryId: first.id,
      label: first.label,
      count: 2,
      example: { wrong: 'er sind', right: 'er ist' },
    });
    expect(body.items[1]).toHaveProperty('lesson');
  });
});
