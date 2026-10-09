import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomSuffix } from '../curriculum-admin/randomId';
import { readFormat, type ExamFormat, type ExamPart } from '../exam/formats';
import { buildTeilSetPrompt, parseTeilSetReply, teilSetProblems, type BundledSetFile, type TeilSetContent, type TeilSetRow, type TeilSetStatus } from '../exam/teilSets';
import { isSetTaskType, itemCount } from '../tasks/taskTypes';
import { errorBodyFor, type ApiErrorBody, type ErrorCode } from '../tutoring/errorCodes';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';

export type TeilSetErrorKind = 'not_found' | 'unavailable' | 'bad_request';

const CODE_FOR: Record<TeilSetErrorKind, ErrorCode> = { not_found: 'not_found', unavailable: 'part_unavailable', bad_request: 'bad_request' };
const STATUS_FOR: Record<TeilSetErrorKind, number> = { not_found: 404, unavailable: 409, bad_request: 400 };

export class TeilSetError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: TeilSetErrorKind
  ) {
    super(message);
    this.code = CODE_FOR[kind];
  }
}

export function toTeilSetErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof TeilSetError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBodyFor(err) };
}

export interface TeilSetDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  now?: () => Date;
  // The bundled sets folder; tests point it at a fixture.
  setsDir?: string;
}

// Spec: starter, approved and unreviewed sets are served; rejected never, reserved only in formal exams.
const USABLE = "('starter','approved','unreviewed')";
// S18: admins approve or reject; reserving belongs to Level exams.
const ADMIN_STATUSES = new Set(['approved', 'rejected']);
const BUNDLED_ID = /__s\d+$/;

interface SetRow {
  id: string;
  format_id: string;
  part_id: string;
  status: TeilSetStatus;
  content: string;
  created_at: string;
  reviewed_at: string | null;
}

// The folder is built at runtime, so Turbopack can't scope it; the file calls opt out (same as deckService).
const defaultSetsDir = () => join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'teil-sets');

function partOf(formatId: string, partId: string): { format: ExamFormat; part: ExamPart } {
  // S1: readFormat accepts only known format-id shapes, so a request-supplied id never becomes a free path.
  const format = readFormat(formatId);
  const part = format?.parts.find((p) => p.id === partId);
  if (!format || !part) throw new TeilSetError(`Unknown exam part: ${formatId}/${partId}`, 'not_found');
  return { format, part };
}

function toRow(row: SetRow): TeilSetRow {
  const set = JSON.parse(row.content) as TeilSetContent;
  return {
    id: row.id,
    formatId: row.format_id,
    partId: row.part_id,
    status: row.status,
    itemCount: isSetTaskType(set.taskType) ? itemCount(set.taskType, set.content) : 0,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    set,
  };
}

// I10: a hand-edited install must fail loudly, naming the file, before anything is written.
function readBundle(dir: string, formatDir: string, file: string): BundledSetFile {
  const name = `${formatDir}/${file}`;
  const bundle = JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(dir, formatDir, file), 'utf8')) as BundledSetFile;
  const problems: string[] = [];
  if (bundle.formatId !== formatDir) problems.push(`formatId ${bundle.formatId} does not match the folder`);
  if (`${bundle.partId}.json` !== file) problems.push(`partId ${bundle.partId} does not match the file name`);
  if (typeof bundle.version !== 'string' || !bundle.version) problems.push('version must be a non-empty string');
  const part = readFormat(formatDir)?.parts.find((p) => p.id === bundle.partId);
  if (!part) problems.push(`no exam part ${formatDir}/${bundle.partId}`);
  if (!Array.isArray(bundle.sets)) problems.push('sets must be a list');
  if (part && Array.isArray(bundle.sets)) {
    const idPattern = new RegExp(`^${formatDir}__${bundle.partId}__s\\d{2,}$`);
    const seen = new Set<string>();
    for (const { id, set } of bundle.sets) {
      if (typeof id !== 'string' || !idPattern.test(id)) problems.push(`${id}: ids look like ${formatDir}__${bundle.partId}__s01`);
      else if (seen.has(id)) problems.push(`${id}: duplicate id`);
      seen.add(id);
      for (const p of teilSetProblems(set, part)) problems.push(`${id}: ${p}`);
    }
  }
  if (problems.length > 0) throw new Error(`Invalid Teil set bundle ${name}:\n${problems.join('\n')}`);
  return bundle;
}

export function createTeilSetService(db: Database.Database, deps: TeilSetDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const now = () => (deps.now ?? (() => new Date()))().toISOString();
  const setsDir = deps.setsDir ?? defaultSetsDir();

  const getRow = (id: string) => db.prepare('SELECT * FROM teil_sets WHERE id = ?').get(id) as SetRow | undefined;
  const markSeen = (id: string) =>
    db.prepare('INSERT INTO teil_seen (set_id, seen_at) VALUES (?, ?) ON CONFLICT(set_id) DO UPDATE SET seen_at = excluded.seen_at').run(id, now());
  const poolId = (formatId: string, partId: string) => `${formatId}__${partId}__p${randomSuffix()}`;
  const served = (row: { id: string; content: string }) => {
    markSeen(row.id);
    return { id: row.id, set: JSON.parse(row.content) as TeilSetContent };
  };

  function requireRow(id: string): SetRow {
    const row = getRow(id);
    if (!row) throw new TeilSetError(`Teil set not found: ${id}`, 'not_found');
    return row;
  }

  function loadBundled(): void {
    if (!existsSync(/*turbopackIgnore: true*/ setsDir)) return;
    const bundles: BundledSetFile[] = [];
    for (const formatDir of readdirSync(/*turbopackIgnore: true*/ setsDir).sort()) {
      // Skips dotfiles too (macOS writes ._* companions on non-Apple volumes).
      if (formatDir.startsWith('.') || !statSync(/*turbopackIgnore: true*/ join(setsDir, formatDir)).isDirectory()) continue;
      for (const file of readdirSync(/*turbopackIgnore: true*/ join(setsDir, formatDir)).sort()) {
        if (file.endsWith('.json') && !file.startsWith('.')) bundles.push(readBundle(setsDir, formatDir, file));
      }
    }
    const loaded = db.prepare('SELECT version FROM teil_bundle_meta WHERE format_id = ? AND part_id = ?');
    // Bundled ids (…__sNN) can't be uploaded or generated, and the update only touches a row of the
    // same part that isn't reserved, so pool sets and formal exam sets are never changed.
    const upsert = db.prepare(
      `INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, ?, ?, 'starter', ?, ?)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content
       WHERE teil_sets.format_id = excluded.format_id AND teil_sets.part_id = excluded.part_id AND teil_sets.status <> 'reserved'`
    );
    // A set dropped from a new bundle version stops being served; rejected, not deleted, since attempts may reference it.
    const starters = db.prepare("SELECT id FROM teil_sets WHERE format_id = ? AND part_id = ? AND status = 'starter'");
    const retire = db.prepare("UPDATE teil_sets SET status = 'rejected', reviewed_at = ? WHERE id = ?");
    const record = db.prepare(
      'INSERT INTO teil_bundle_meta (format_id, part_id, version) VALUES (?, ?, ?) ON CONFLICT(format_id, part_id) DO UPDATE SET version = excluded.version'
    );
    db.transaction(() => {
      for (const bundle of bundles) {
        const current = loaded.get(bundle.formatId, bundle.partId) as { version: string } | undefined;
        if (current?.version === bundle.version) continue;
        const at = now();
        for (const { id, set } of bundle.sets) upsert.run(id, bundle.formatId, bundle.partId, JSON.stringify(set), at);
        const kept = new Set(bundle.sets.map((s) => s.id));
        for (const { id } of starters.all(bundle.formatId, bundle.partId) as { id: string }[]) if (!kept.has(id)) retire.run(at, id);
        record.run(bundle.formatId, bundle.partId, bundle.version);
      }
    })();
  }

  // Spec: unseen first (in id order); an exhausted part gets one new AI set; if that fails, the least recently seen.
  async function pickForPractice(formatId: string, partId: string): Promise<{ id: string; set: TeilSetContent }> {
    const { format, part } = partOf(formatId, partId);
    if (!isSetTaskType(part.taskType)) throw new TeilSetError(`No practice sets for ${part.taskType}`, 'unavailable');
    const usable = db
      .prepare(
        `SELECT s.id, s.content, k.seen_at FROM teil_sets s LEFT JOIN teil_seen k ON k.set_id = s.id
         WHERE s.format_id = ? AND s.part_id = ? AND s.status IN ${USABLE} ORDER BY s.id`
      )
      .all(formatId, partId) as { id: string; content: string; seen_at: string | null }[];
    const unseen = usable.find((r) => r.seen_at === null);
    if (unseen) return served(unseen);

    const reply = await generate(buildTeilSetPrompt(part, format.level));
    const set = reply.ok ? parseTeilSetReply(reply.text, part) : null;
    if (set) {
      const id = poolId(formatId, partId);
      db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, ?, ?, 'unreviewed', ?, ?)").run(
        id,
        formatId,
        partId,
        JSON.stringify(set),
        now()
      );
      markSeen(id);
      return { id, set };
    }

    const oldest = [...usable].sort((a, b) => (a.seen_at! < b.seen_at! ? -1 : a.seen_at! > b.seen_at! ? 1 : a.id < b.id ? -1 : 1))[0];
    if (!oldest) throw new TeilSetError('No practice sets for this part', 'unavailable');
    return served(oldest);
  }

  function list(formatId: string, partId: string): TeilSetRow[] {
    partOf(formatId, partId);
    const rows = db.prepare('SELECT * FROM teil_sets WHERE format_id = ? AND part_id = ? ORDER BY created_at DESC, id DESC').all(formatId, partId) as SetRow[];
    return rows.map(toRow);
  }

  function setStatus(id: string, status: string): void {
    if (!ADMIN_STATUSES.has(status)) throw new TeilSetError(`A set can be approved or rejected, not ${status}`, 'bad_request');
    if (requireRow(id).status === 'reserved') throw new TeilSetError('Reserved exam sets cannot be changed here', 'bad_request');
    db.prepare('UPDATE teil_sets SET status = ?, reviewed_at = ? WHERE id = ?').run(status, now(), id);
  }

  function update(id: string, set: TeilSetContent): void {
    const row = requireRow(id);
    const { part } = partOf(row.format_id, row.part_id);
    const problems = teilSetProblems(set, part);
    if (problems.length > 0) throw new TeilSetError(problems.join('; '), 'bad_request');
    db.prepare('UPDATE teil_sets SET content = ? WHERE id = ?').run(JSON.stringify(set), id);
  }

  // Starter and pool sets only; reserved sets belong to the formal exams.
  function remove(id: string): void {
    const row = requireRow(id);
    if (row.status === 'reserved') throw new TeilSetError('Reserved exam sets cannot be deleted here', 'bad_request');
    db.transaction(() => {
      db.prepare('DELETE FROM teil_seen WHERE set_id = ?').run(id);
      db.prepare('DELETE FROM teil_sets WHERE id = ?').run(id);
    })();
  }

  // S18: copy a set under a new pool id, unreviewed, for the admin to edit.
  function duplicate(id: string): TeilSetRow {
    const row = requireRow(id);
    const copyId = poolId(row.format_id, row.part_id);
    db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, ?, ?, 'unreviewed', ?, ?)").run(
      copyId,
      row.format_id,
      row.part_id,
      row.content,
      now()
    );
    return toRow(getRow(copyId)!);
  }

  // Every set is checked first; one bad set rejects the whole upload and nothing changes.
  function upload(formatId: string, partId: string, sets: { id: string; set: TeilSetContent }[]): { count: number } {
    const { part } = partOf(formatId, partId);
    if (!Array.isArray(sets) || sets.length === 0) throw new TeilSetError('The upload has no sets', 'bad_request');
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const entry of sets) {
      const id = entry?.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
        problems.push(`${String(id)}: ids use letters, digits, - and _`);
        continue;
      }
      if (seen.has(id)) problems.push(`${id}: duplicate id`);
      seen.add(id);
      const existing = getRow(id);
      if (existing && (existing.format_id !== formatId || existing.part_id !== partId)) problems.push(`${id}: belongs to ${existing.format_id}/${existing.part_id}`);
      else if (existing?.status === 'reserved') problems.push(`${id}: reserved exam sets can't be replaced here`);
      // The …__sNN namespace belongs to bundled sets; only an existing bundled row of this part (an export round trip) may reuse one.
      else if (BUNDLED_ID.test(id) && !existing) problems.push(`${id}: ids ending in __s<number> are reserved for bundled sets`);
      for (const p of teilSetProblems(entry.set, part)) problems.push(`${id}: ${p}`);
    }
    if (problems.length > 0) throw new TeilSetError(`The upload was not saved:\n${problems.join('\n')}`, 'bad_request');
    const upsert = db.prepare(
      `INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at, reviewed_at) VALUES (?, ?, ?, 'approved', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'approved', reviewed_at = excluded.reviewed_at`
    );
    db.transaction(() => {
      for (const { id, set } of sets) {
        const at = now();
        upsert.run(id, formatId, partId, JSON.stringify(set), at, at);
      }
    })();
    return { count: sets.length };
  }

  // Download: every set of the part except rejected and reserved ones, in the bundle file shape.
  function exportPart(formatId: string, partId: string): BundledSetFile {
    partOf(formatId, partId);
    const rows = db
      .prepare("SELECT id, content FROM teil_sets WHERE format_id = ? AND part_id = ? AND status NOT IN ('rejected','reserved') ORDER BY id")
      .all(formatId, partId) as { id: string; content: string }[];
    const meta = db.prepare('SELECT version FROM teil_bundle_meta WHERE format_id = ? AND part_id = ?').get(formatId, partId) as { version: string } | undefined;
    return { formatId, partId, version: meta?.version ?? '1', sets: rows.map((r) => ({ id: r.id, set: JSON.parse(r.content) as TeilSetContent })) };
  }

  return { loadBundled, pickForPractice, list, setStatus, update, remove, duplicate, upload, exportPart };
}
