import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runContentCheck } from './contentCheck';

function seed() {
  const db = createDbClient(':memory:');
  db.prepare("INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES ('l1', 'generic', 'A1', 'grammar', 'Articles', '')").run();
  return db;
}

describe('runContentCheck', () => {
  it('reports missing translations at most daily, and only new issues', async () => {
    const db = seed();
    const notify = { info: vi.fn(async () => {}) };
    let now = new Date('2026-09-29T10:00:00Z');
    const deps = { notify, now: () => now };

    const first = await runContentCheck(db, deps);
    expect(first).toMatchObject({ ran: true, missingTranslations: 1, newIssues: 1 });
    expect(notify.info).toHaveBeenCalledWith('content_issues', 'Content issues', expect.stringContaining('missing a translation'));

    now = new Date('2026-09-29T20:00:00Z');
    expect((await runContentCheck(db, deps)).ran).toBe(false);

    now = new Date('2026-09-30T11:00:00Z');
    expect(await runContentCheck(db, deps)).toMatchObject({ ran: true, newIssues: 0 });
    expect(notify.info).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when there are no issues', async () => {
    const db = createDbClient(':memory:');
    const notify = { info: vi.fn(async () => {}) };
    expect(await runContentCheck(db, { notify })).toMatchObject({ ran: true, newIssues: 0 });
    expect(notify.info).not.toHaveBeenCalled();
  });
});
