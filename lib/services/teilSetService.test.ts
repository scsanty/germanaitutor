import { afterEach, describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTeilSetService, TeilSetError, toTeilSetErrorResponse } from './teilSetService';

const starter = JSON.parse(readFileSync(join(process.cwd(), 'data', 'teil-sets', 'telc-b1', 'lesen-1.json'), 'utf8'));
const STARTER_SET = starter.sets[0].set;
const STARTER_ID = starter.sets[0].id as string;

const fixtureDirs: string[] = [];
afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureDir(bundle: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'teil-sets-'));
  fixtureDirs.push(dir);
  mkdirSync(join(dir, 'telc-b1'));
  writeFileSync(join(dir, 'telc-b1', 'lesen-1.json'), JSON.stringify(bundle));
  return dir;
}

function setup(replies: string[] = []) {
  const db = createDbClient(':memory:');
  const generate = vi.fn(async () => {
    const text = replies.shift();
    return text === undefined ? { ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const } : { ok: true as const, text };
  });
  let clock = 0;
  const service = createTeilSetService(db, { generate, now: () => new Date(Date.UTC(2026, 8, 29, 10, 0, clock++)) });
  service.loadBundled();
  return { db, service, generate };
}

describe('teilSetService', () => {
  it('loads the bundled starter sets once', () => {
    const { db, service } = setup();
    service.loadBundled();
    expect((db.prepare("SELECT COUNT(*) AS n FROM teil_sets WHERE format_id = 'telc-b1' AND part_id = 'lesen-1'").get() as { n: number }).n).toBeGreaterThan(0);
  });

  it('serves unseen sets first, then generates one when all are seen, then falls back to the least recently seen', async () => {
    const { db, service, generate } = setup();
    const ids = (db.prepare("SELECT id FROM teil_sets WHERE part_id = 'lesen-1'").all() as { id: string }[]).map((r) => r.id);
    const served = [];
    for (let i = 0; i < ids.length; i++) served.push((await service.pickForPractice('telc-b1', 'lesen-1')).id);
    expect(new Set(served)).toEqual(new Set(ids));
    const fallback = await service.pickForPractice('telc-b1', 'lesen-1'); // generation fails (no replies)
    expect(generate).toHaveBeenCalledTimes(1);
    expect(fallback.id).toBe(served[0]);
  });

  it('never serves rejected or reserved sets', async () => {
    const { db, service, generate } = setup();
    db.exec("UPDATE teil_sets SET status = 'rejected' WHERE part_id = 'lesen-1'");
    const picked = await service.pickForPractice('telc-b1', 'lesen-1').catch((e) => e);
    expect(picked).toMatchObject({ kind: 'unavailable' });
    expect(generate).toHaveBeenCalledTimes(1); // an empty part tries one generation first
  });

  it('skips a reserved set next to an unseen one, and never falls back to it', async () => {
    const { db, service } = setup();
    service.upload('telc-b1', 'lesen-1', [{ id: 'a-reserved', set: STARTER_SET }, { id: 'b-approved', set: STARTER_SET }]);
    db.exec("UPDATE teil_sets SET status = 'reserved' WHERE id = 'a-reserved'");
    db.exec(`INSERT INTO teil_seen (set_id, seen_at) VALUES ('${STARTER_ID}', '2026-01-01T00:00:00.000Z')`);
    expect((await service.pickForPractice('telc-b1', 'lesen-1')).id).toBe('b-approved');
    const fallback = await service.pickForPractice('telc-b1', 'lesen-1'); // all seen, generation fails
    expect(fallback.id).toBe(STARTER_ID);
    expect((await service.pickForPractice('telc-b1', 'lesen-1')).id).toBe('b-approved');
  });

  // Review Important 2: the reserved boundary holds on every admin path.
  it('keeps reserved sets out of upload, status changes and export', () => {
    const { db, service } = setup();
    service.upload('telc-b1', 'lesen-1', [{ id: 'exam-1', set: STARTER_SET }]);
    db.exec("UPDATE teil_sets SET status = 'reserved' WHERE id = 'exam-1'");
    expect(() => service.upload('telc-b1', 'lesen-1', [{ id: 'exam-1', set: STARTER_SET }])).toThrow(/exam-1: reserved exam sets can't be replaced here/);
    expect(() => service.setStatus('exam-1', 'approved')).toThrow(/Reserved/);
    expect(db.prepare("SELECT status FROM teil_sets WHERE id = 'exam-1'").get()).toEqual({ status: 'reserved' });
    expect(service.exportPart('telc-b1', 'lesen-1').sets.map((s) => s.id)).toEqual([STARTER_ID]);
  });

  // Review Important 1: uploads can't take bundled ids, so a bundle reload never overwrites them.
  it('refuses new uploads in the bundled id namespace, but allows re-uploading an existing bundled set', () => {
    const { service } = setup();
    expect(() => service.upload('telc-b1', 'lesen-1', [{ id: 'telc-b1__lesen-1__s02', set: STARTER_SET }])).toThrow(/telc-b1__lesen-1__s02: ids ending in __s<number>/);
    expect(service.upload('telc-b1', 'lesen-1', [{ id: STARTER_ID, set: STARTER_SET }])).toEqual({ count: 1 });
  });

  // Review Focus 5
  it('rejects an upload whose set has the wrong task type, naming it, and changes nothing', () => {
    const { db, service } = setup();
    const before = db.prepare("SELECT COUNT(*) AS n FROM teil_sets WHERE part_id = 'lesen-1'").get();
    expect(() =>
      service.upload('telc-b1', 'lesen-1', [{ id: 'bad', set: { taskType: 'cloze', content: { text: 'x', gaps: [] }, explanations: [] } as never }])
    ).toThrow(/bad: the part needs matching, not cloze/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM teil_sets WHERE part_id = 'lesen-1'").get()).toEqual(before);
  });

  it('stores a generated set as unreviewed, German-only pool content, and serves it seen', async () => {
    const { db, service, generate } = setup([JSON.stringify({ content: STARTER_SET.content, explanations: STARTER_SET.explanations })]);
    await service.pickForPractice('telc-b1', 'lesen-1');
    const fresh = await service.pickForPractice('telc-b1', 'lesen-1');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(fresh.id).toMatch(/^telc-b1__lesen-1__p[0-9a-f]{6}$/);
    expect(fresh.set).toEqual(STARTER_SET);
    expect(db.prepare('SELECT status FROM teil_sets WHERE id = ?').get(fresh.id)).toEqual({ status: 'unreviewed' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM teil_seen WHERE set_id = ?').get(fresh.id)).toEqual({ n: 1 });
    const prompt = (generate.mock.calls[0] as unknown as [{ systemPrompt: string }])[0].systemPrompt;
    expect(prompt).toContain('CEFR level B1');
  });

  it('rejects unknown or path-like format ids as not found (S1)', async () => {
    const { service } = setup();
    await expect(service.pickForPractice('../../etc', 'lesen-1')).rejects.toMatchObject({ kind: 'not_found' });
    expect(() => service.list('telc-b1', 'nope')).toThrow(TeilSetError);
  });

  it('maps errors to HTTP responses, with part_unavailable for an exhausted part (S7)', () => {
    expect(toTeilSetErrorResponse(new TeilSetError('x', 'unavailable'))).toEqual({ status: 409, body: { error: 'x', code: 'part_unavailable' } });
    expect(toTeilSetErrorResponse(new TeilSetError('x', 'not_found'))?.status).toBe(404);
    expect(toTeilSetErrorResponse(new TeilSetError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toTeilSetErrorResponse(new Error('other'))).toBeNull();
  });

  it('lists every status with its item count, and lets admins approve or reject only (S18)', () => {
    const { service } = setup();
    const [row] = service.list('telc-b1', 'lesen-1');
    expect(row).toMatchObject({ id: STARTER_ID, formatId: 'telc-b1', partId: 'lesen-1', status: 'starter', itemCount: 5, reviewedAt: null, set: STARTER_SET });
    service.setStatus(STARTER_ID, 'rejected');
    expect(service.list('telc-b1', 'lesen-1')[0]).toMatchObject({ status: 'rejected', reviewedAt: '2026-09-29T10:00:01.000Z' });
    expect(() => service.setStatus(STARTER_ID, 'reserved')).toThrow(/approved or rejected/);
    expect(() => service.setStatus('missing', 'approved')).toThrow(TeilSetError);
  });

  it('duplicates a set as unreviewed pool content (S18), and edits only with a valid set', () => {
    const { service } = setup();
    const copy = service.duplicate(STARTER_ID);
    expect(copy).toMatchObject({ status: 'unreviewed', set: STARTER_SET });
    expect(copy.id).toMatch(/^telc-b1__lesen-1__p[0-9a-f]{6}$/);
    expect(service.list('telc-b1', 'lesen-1')[0].id).toBe(copy.id);
    const edited = { ...STARTER_SET, content: { ...STARTER_SET.content, answers: [0, 1, 2, 3, 4] } };
    service.update(copy.id, edited);
    expect(service.list('telc-b1', 'lesen-1')[0].set).toEqual(edited);
    expect(() => service.update(copy.id, { ...STARTER_SET, explanations: [] })).toThrow(/5 items need 5 explanations/);
  });

  it('removes sets with their seen mark, but never reserved ones', async () => {
    const { db, service } = setup();
    await service.pickForPractice('telc-b1', 'lesen-1');
    service.remove(STARTER_ID);
    expect(db.prepare('SELECT COUNT(*) AS n FROM teil_seen').get()).toEqual({ n: 0 });
    service.upload('telc-b1', 'lesen-1', [{ id: 'mine', set: STARTER_SET }]);
    db.exec("UPDATE teil_sets SET status = 'reserved' WHERE id = 'mine'");
    expect(() => service.remove('mine')).toThrow(/Reserved/);
  });

  it('uploads valid sets as approved, and exports the part in the bundle shape', () => {
    const { service } = setup();
    expect(service.upload('telc-b1', 'lesen-1', [{ id: 'up-1', set: STARTER_SET }, { id: 'up-2', set: STARTER_SET }])).toEqual({ count: 2 });
    expect(service.list('telc-b1', 'lesen-1').filter((r) => r.status === 'approved').map((r) => r.id).sort()).toEqual(['up-1', 'up-2']);
    expect(() => service.upload('telc-b1', 'lesen-1', [{ id: 'dup', set: STARTER_SET }, { id: 'dup', set: STARTER_SET }])).toThrow(/dup: duplicate id/);
    service.setStatus('up-2', 'rejected');
    expect(service.exportPart('telc-b1', 'lesen-1')).toEqual({
      formatId: 'telc-b1',
      partId: 'lesen-1',
      version: '1',
      sets: [STARTER_ID, 'up-1'].sort().map((id) => ({ id, set: STARTER_SET })),
    });
  });

  it('reloads a bundle only on a new version, keeping pool sets and statuses', () => {
    const db = createDbClient(':memory:');
    const dir = fixtureDir({ ...starter, version: '1' });
    createTeilSetService(db, { setsDir: dir }).loadBundled();
    const service = createTeilSetService(db, { setsDir: dir });
    service.upload('telc-b1', 'lesen-1', [{ id: 'pool-1', set: STARTER_SET }]);
    service.setStatus(STARTER_ID, 'rejected');
    const changed = { ...STARTER_SET, content: { ...STARTER_SET.content, answers: [0, 1, 2, 3, 4] } };
    writeFileSync(join(dir, 'telc-b1', 'lesen-1.json'), JSON.stringify({ ...starter, sets: [{ id: STARTER_ID, set: changed }] }));
    service.loadBundled(); // same version: nothing changes
    expect(service.list('telc-b1', 'lesen-1').find((r) => r.id === STARTER_ID)?.set).toEqual(STARTER_SET);
    writeFileSync(join(dir, 'telc-b1', 'lesen-1.json'), JSON.stringify({ ...starter, version: '2', sets: [{ id: STARTER_ID, set: changed }] }));
    service.loadBundled();
    const rows = service.list('telc-b1', 'lesen-1');
    expect(rows.find((r) => r.id === STARTER_ID)).toMatchObject({ status: 'rejected', set: changed });
    expect(rows.find((r) => r.id === 'pool-1')).toMatchObject({ status: 'approved', set: STARTER_SET });
  });

  it('a version bump never touches a row of another part or a reserved row, and retires dropped starters', () => {
    const db = createDbClient(':memory:');
    const dir = fixtureDir({ ...starter, version: '1' });
    const service = createTeilSetService(db, { setsDir: dir });
    service.loadBundled();
    // Simulate rows that took ids a later bundle ships (e.g. from before the namespace guard).
    const lesen2 = { taskType: 'passage_questions', content: { passage: 'T', questions: [] }, explanations: [] };
    db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, 'telc-b1', 'lesen-2', 'approved', ?, 'x')").run('telc-b1__lesen-1__s02', JSON.stringify(lesen2));
    db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, 'telc-b1', 'lesen-1', 'reserved', ?, 'x')").run('telc-b1__lesen-1__s03', JSON.stringify(STARTER_SET));
    const changed = { ...STARTER_SET, content: { ...STARTER_SET.content, answers: [0, 1, 2, 3, 4] } };
    writeFileSync(
      join(dir, 'telc-b1', 'lesen-1.json'),
      JSON.stringify({ ...starter, version: '2', sets: ['telc-b1__lesen-1__s02', 'telc-b1__lesen-1__s03'].map((id) => ({ id, set: changed })) })
    );
    service.loadBundled();
    const content = (id: string) => JSON.parse((db.prepare('SELECT content FROM teil_sets WHERE id = ?').get(id) as { content: string }).content);
    expect(content('telc-b1__lesen-1__s02')).toEqual(lesen2);
    expect(content('telc-b1__lesen-1__s03')).toEqual(STARTER_SET);
    expect(db.prepare('SELECT status FROM teil_sets WHERE id = ?').get(STARTER_ID)).toEqual({ status: 'rejected' });
  });

  // Preflight I10: an invalid bundle throws, naming the file, before anything is written.
  it('refuses an invalid bundled file, naming it', () => {
    const db = createDbClient(':memory:');
    const dir = fixtureDir({ ...starter, sets: [{ id: STARTER_ID, set: { ...STARTER_SET, explanations: [] } }] });
    expect(() => createTeilSetService(db, { setsDir: dir }).loadBundled()).toThrow(/telc-b1\/lesen-1\.json[\s\S]*5 items need 5 explanations/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM teil_sets').get()).toEqual({ n: 0 });
  });
});

// Preflight S2: the sets folder is built at runtime; without the opt-out Turbopack traces the whole project.
describe('bundled set file access', () => {
  it('opts the dynamic paths out of Turbopack tracing', () => {
    const source = readFileSync(join(process.cwd(), 'lib', 'services', 'teilSetService.ts'), 'utf8');
    expect(source).toContain("join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'teil-sets')");
    expect(source).toContain('readFileSync(/*turbopackIgnore: true*/ join(dir, formatDir, file)');
    expect(source).toContain('readdirSync(/*turbopackIgnore: true*/ setsDir)');
  });
});
