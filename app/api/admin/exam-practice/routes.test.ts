import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { getDb, closeDb } from '@/lib/db/client';
import { createTeilSetService } from '@/lib/services/teilSetService';
import type { TeilSetRow } from '@/lib/exam/teilSets';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn() }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { GET, PUT } from './route';
import { PATCH, POST, DELETE } from './[id]/route';
import { GET as exportPart } from './export/route';

const STARTER = 'telc-b1__lesen-1__s01';
const LIST_URL = 'http://localhost/api/admin/exam-practice?formatId=telc-b1&partId=lesen-1';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) => new Request('http://localhost', { method, body: JSON.stringify(body) });

async function list(): Promise<TeilSetRow[]> {
  return (await GET(new Request(LIST_URL))).json();
}

describe('/api/admin/exam-practice', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-teil-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    createTeilSetService(getDb()).loadBundled();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 without an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await GET(new Request(LIST_URL))).status).toBe(401);
    expect((await PUT(json('PUT', {}))).status).toBe(401);
    expect((await PATCH(json('PATCH', { status: 'approved' }), ctx(STARTER))).status).toBe(401);
    expect((await POST(json('POST', {}), ctx(STARTER))).status).toBe(401);
    expect((await DELETE(json('DELETE', {}), ctx(STARTER))).status).toBe(401);
    expect((await exportPart(new Request(`${LIST_URL}&format=yaml`))).status).toBe(401);
  });

  it('lists the bundled telc B1 lesen-1 sets', async () => {
    const rows = await list();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.formatId === 'telc-b1' && r.partId === 'lesen-1')).toBe(true);
    const starter = rows.find((r) => r.id === STARTER)!;
    expect(starter).toMatchObject({ status: 'starter', itemCount: 5 });
    expect(starter.set!.taskType).toBe('matching');
  });

  it('404s an unknown format or part, and 400s missing params', async () => {
    expect((await GET(new Request('http://localhost/api/admin/exam-practice?formatId=../../x&partId=lesen-1'))).status).toBe(404);
    expect((await GET(new Request('http://localhost/api/admin/exam-practice?formatId=telc-b1&partId=nope'))).status).toBe(404);
    expect((await GET(new Request('http://localhost/api/admin/exam-practice?formatId=telc-b1'))).status).toBe(400);
  });

  it('approves a set with PATCH { status }, and refuses other statuses', async () => {
    const res = await PATCH(json('PATCH', { status: 'approved' }), ctx(STARTER));
    expect(res.status).toBe(200);
    expect((await list()).find((r) => r.id === STARTER)!.status).toBe('approved');
    expect((await PATCH(json('PATCH', { status: 'reserved' }), ctx(STARTER))).status).toBe(400);
    expect((await PATCH(json('PATCH', { status: 'approved' }), ctx('missing'))).status).toBe(404);
    expect((await PATCH(json('PATCH', {}), ctx(STARTER))).status).toBe(400);
  });

  it('edits content with PATCH { set } and returns validation problems as given', async () => {
    const starter = (await list()).find((r) => r.id === STARTER)!;
    const set = { ...starter.set!, explanations: starter.set!.explanations.map((e) => ({ ...e, en: `${e.en}!` })) };
    expect((await PATCH(json('PATCH', { set }), ctx(STARTER))).status).toBe(200);
    expect((await list()).find((r) => r.id === STARTER)!.set!.explanations[0].en).toMatch(/!$/);

    const bad = await PATCH(json('PATCH', { set: { ...set, explanations: [] } }), ctx(STARTER));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('5 items need 5 explanations, found 0');
  });

  it('duplicates a set as unreviewed and deletes it', async () => {
    const res = await POST(json('POST', {}), ctx(STARTER));
    expect(res.status).toBe(201);
    const copy = (await res.json()) as TeilSetRow;
    expect(copy).toMatchObject({ status: 'unreviewed', formatId: 'telc-b1', partId: 'lesen-1' });
    expect(copy.id).toMatch(/^telc-b1__lesen-1__p/);
    expect((await DELETE(json('DELETE', {}), ctx(copy.id))).status).toBe(200);
    expect((await list()).some((r) => r.id === copy.id)).toBe(false);
    expect((await DELETE(json('DELETE', {}), ctx(copy.id))).status).toBe(404);
  });

  it('refuses to delete, edit, re-status or duplicate a reserved set, and lists it without content', async () => {
    const starter = (await list()).find((r) => r.id === STARTER)!;
    const db = getDb();
    db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES ('exam-1', 'telc-b1', 'lesen-1', 'reserved', ?, '2026-01-01')").run(
      JSON.stringify(starter.set)
    );
    const count = () => (db.prepare('SELECT COUNT(*) AS n FROM teil_sets').get() as { n: number }).n;
    const content = () => (db.prepare("SELECT content, status FROM teil_sets WHERE id = 'exam-1'").get() as { content: string; status: string });
    const before = count();
    expect((await DELETE(json('DELETE', {}), ctx('exam-1'))).status).toBe(400);
    const edited = { ...starter.set!, explanations: starter.set!.explanations.map((e) => ({ ...e, en: 'changed' })) };
    const patched = await PATCH(json('PATCH', { set: edited }), ctx('exam-1'));
    expect(patched.status).toBe(400);
    expect((await patched.json()).error).toBe('Reserved exam sets cannot be changed here');
    expect((await PATCH(json('PATCH', { status: 'approved' }), ctx('exam-1'))).status).toBe(400);
    expect(content()).toEqual({ content: JSON.stringify(starter.set), status: 'reserved' });
    expect((await POST(json('POST', {}), ctx('exam-1'))).status).toBe(400);
    expect(count()).toBe(before);
    expect((await list()).find((r) => r.id === 'exam-1')).toMatchObject({ status: 'reserved', itemCount: 5, set: null });
  });

  it('uploads sets, and rejects a set of the wrong type with an error naming its id', async () => {
    const starter = (await list()).find((r) => r.id === STARTER)!;
    const ok = await PUT(json('PUT', { formatId: 'telc-b1', partId: 'lesen-1', format: 'json', text: JSON.stringify({ sets: [{ id: 'mine-1', set: starter.set }] }) }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ count: 1 });
    expect((await list()).find((r) => r.id === 'mine-1')!.status).toBe('approved');

    const cloze = { taskType: 'cloze', content: { text: 'Ich {{1}} hier.', gaps: [{ mode: 'select', options: ['bin', 'bist'], correctIndex: 0 }] }, explanations: [{ en: 'a', de: 'b' }] };
    const bad = await PUT(json('PUT', { formatId: 'telc-b1', partId: 'lesen-1', format: 'json', text: JSON.stringify([{ id: 'wrong-1', set: cloze }]) }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('wrong-1: the part needs matching, not cloze');
    expect((await list()).some((r) => r.id === 'wrong-1')).toBe(false);
  });

  it('answers 400 with the problem list for an uploaded cloze set with a null or unknown-mode gap', async () => {
    const put = (gap: unknown) => {
      const gaps = Array.from({ length: 10 }, (_, i) => (i === 0 ? gap : { mode: 'select', options: ['a', 'b', 'c'], correctIndex: 0 }));
      const text = Array.from({ length: 10 }, (_, i) => `Wort {{${i + 1}}}`).join(' ');
      const set = { taskType: 'cloze', content: { text, gaps }, explanations: gaps.map(() => ({ en: 'a', de: 'b' })) };
      return PUT(json('PUT', { formatId: 'telc-b1', partId: 'sprachbausteine-1', format: 'json', text: JSON.stringify([{ id: 'bad-gap', set }]) }));
    };
    for (const gap of [null, { mode: 'dropdown' }, {}]) {
      const res = await put(gap);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('bad-gap: gap 1 needs a mode of typed, select or bank');
    }
  });

  it('rejects unparseable text, a file for another part, and a bad format', async () => {
    const put = (body: unknown) => PUT(json('PUT', body));
    expect((await put({ formatId: 'telc-b1', partId: 'lesen-1', format: 'yaml', text: 'a: [' })).status).toBe(400);
    expect((await put({ formatId: 'telc-b1', partId: 'lesen-1', format: 'json', text: '{"partId":"lesen-2","sets":[]}' })).status).toBe(400);
    expect((await put({ formatId: 'telc-b1', partId: 'lesen-1', format: 'xml', text: '[]' })).status).toBe(400);
    expect((await put({ formatId: '../x', partId: 'lesen-1', format: 'json', text: '[{"id":"a","set":{}}]' })).status).toBe(404);
  });

  it('downloads YAML that parses back to the same sets, and the JSON re-uploads', async () => {
    const res = await exportPart(new Request(`${LIST_URL}&format=yaml`));
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="telc-b1__lesen-1.yaml"');
    const text = await res.text();
    const bundle = parseYaml(text);
    const expected = createTeilSetService(getDb()).exportPart('telc-b1', 'lesen-1');
    expect(bundle).toEqual(expected);
    expect(bundle.sets.map((s: { id: string }) => s.id)).toContain(STARTER);

    const jsonText = await (await exportPart(new Request(`${LIST_URL}&format=json`))).text();
    expect(JSON.parse(jsonText)).toEqual(expected);
    const again = await PUT(json('PUT', { formatId: 'telc-b1', partId: 'lesen-1', format: 'yaml', text }));
    expect(again.status).toBe(200);
  });
});
