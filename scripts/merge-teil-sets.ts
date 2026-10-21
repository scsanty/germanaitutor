// Merges one-set writer files into the bundled Teil set files and validates them.
// Input:  <workDir>/<formatId>/<partId>__sNN.json, each {"id": "<formatId>__<partId>__sNN", "set": {...}}
// Output: <dataRoot>/teil-sets/<formatId>/<partId>.json (dataRoot defaults to ./data, or $TEIL_DATA_ROOT, or --data-root)
// Run: npx tsx scripts/merge-teil-sets.ts <workDir> [--format <formatId>] [--check-only] [--data-root <dir>]
//
// audio_questions sets also pass scripts/audio-content-checks.ts: evidence on every question, inside exactly one
// transcript line; the part's option shape (Richtig/Falsch, a/b/c); the text count of multi-text parts; speakers;
// and no transcript shared with another bundled set. TTS hazards and the like are printed as warnings only.
// letter sets get the S14 checks through teilSetProblems (task count, wordTarget, explanation count), plus these
// warnings: a situation repeated within a part (merged and incoming sets), and English words in the situation or
// a Leitpunkt (exam content is German-only). A letters line per track reports sets against the 66 expected.
// A part file's "version" goes up by one whenever its merged sets differ from the file on disk, so installs
// that loaded the older bundle reload it (I11). An unchanged part keeps its version and is not rewritten.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { teilSetProblems, type BundledSetFile, type TeilSetContent } from '../lib/exam/teilSets';
import type { ExamFormat } from '../lib/exam/formats';
import { audioContentProblems, englishWords, transcriptHashOf } from './audio-content-checks';
import type { LetterContent } from '../lib/tasks/letter';

export interface MergeOptions {
  workDir: string;
  dataRoot?: string;
  format?: string;
  checkOnly?: boolean;
}

export interface MergeResult {
  ok: boolean;
  lines: string[];
  itemCounts: Record<string, number>;
}

const FILE_RE = /^(.+)__s(\d\d)\.json$/;

// Expected listening items per track once every listening part has its 3 starter sets (preflight).
export const EXPECTED_LISTENING_ITEMS: Record<string, number> = { telc: 294, goethe: 375, generic: 204 };
// Letter sets once every one of the 22 letter parts has its 3 starter sets (NaDoch 7 parts, Goethe 10, telc 5).
export const EXPECTED_LETTER_SETS: Record<string, number> = { generic: 21, goethe: 30, telc: 15 };
const TRACK_NAMES: Record<string, string> = { telc: 'telc', goethe: 'Goethe', generic: 'NaDoch' };

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// Every audio transcript hash already bundled, by set id.
function bundledAudioHashes(dataRoot: string): Map<string, string> {
  const byId = new Map<string, string>();
  const dir = join(dataRoot, 'teil-sets');
  if (!existsSync(dir)) return byId;
  for (const formatId of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    for (const f of readdirSync(join(dir, formatId)).filter((n) => n.endsWith('.json'))) {
      let file: BundledSetFile;
      try {
        file = readJson<BundledSetFile>(join(dir, formatId, f));
      } catch {
        continue;
      }
      for (const s of file.sets ?? []) {
        if (s.set?.taskType !== 'audio_questions') continue;
        const h = transcriptHashOf(s.set.content);
        if (h) byId.set(s.id, h);
      }
    }
  }
  return byId;
}

const normalizeSituation = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Warnings for one letter set: English words, and situations that repeat another set's task of the part.
function letterWarnings(id: string, set: TeilSetContent, others: { id: string; set: TeilSetContent }[]): string[] {
  const tasks = (set.content as LetterContent).tasks ?? [];
  const out: string[] = [];
  const english = (where: string, text: string) => {
    const en = englishWords(text);
    if (en.length > 0) out.push(`${id}: ${where}: English word(s) ${en.join(', ')}; exam content is German-only`);
  };
  tasks.forEach((t, i) => {
    english(`task ${i + 1} situation`, t.situation);
    t.leitpunkte.forEach((l, k) => english(`task ${i + 1} Leitpunkt ${k + 1}`, l));
    const mine = normalizeSituation(t.situation);
    for (const o of others) {
      const j = ((o.set.content as LetterContent).tasks ?? []).findIndex((ot) => normalizeSituation(ot.situation) === mine);
      if (j >= 0) {
        out.push(`${id}: task ${i + 1}: the situation repeats ${o.id}'s task ${j + 1}`);
        break;
      }
    }
  });
  return out;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function mergeTeilSets(opts: MergeOptions): MergeResult {
  const dataRoot = resolve(opts.dataRoot ?? process.env.TEIL_DATA_ROOT ?? 'data');
  const lines: string[] = [];
  const itemCounts: Record<string, number> = {};
  let ok = true;
  if (!existsSync(opts.workDir)) return { ok: false, lines: [`work folder not found: ${opts.workDir}`], itemCounts };
  const audioHashes = bundledAudioHashes(dataRoot);
  // Listening sets per format and part after this run (check-only included), for the totals.
  const listeningSets = new Map<string, number>();
  // Letter sets and tasks per format and part after this run.
  const letterSets = new Map<string, { sets: number; tasks: number }>();

  const formatIds = readdirSync(opts.workDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && (!opts.format || d.name === opts.format))
    .map((d) => d.name)
    .sort();

  for (const formatId of formatIds) {
    const formatPath = join(dataRoot, 'exam-formats', `${formatId}.json`);
    if (!existsSync(formatPath)) {
      ok = false;
      lines.push(`${formatId}: no such exam format`);
      continue;
    }
    const format = readJson<ExamFormat>(formatPath);
    const byPart = new Map<string, { id: string; set: TeilSetContent; file: string }[]>();
    const fileProblems: string[] = [];

    for (const file of readdirSync(join(opts.workDir, formatId)).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) {
      const m = FILE_RE.exec(file);
      if (!m) {
        fileProblems.push(`${formatId}/${file}: file name must be <partId>__sNN.json`);
        continue;
      }
      const partId = m[1];
      let entry: { id?: unknown; set?: TeilSetContent };
      try {
        entry = readJson(join(opts.workDir, formatId, file));
      } catch {
        fileProblems.push(`${formatId}/${file}: not valid JSON`);
        continue;
      }
      const expectedId = `${formatId}__${partId}__s${m[2]}`;
      if (typeof entry.id !== 'string' || !/^[a-z0-9-]+__[a-z0-9-]+__s\d\d$/.test(entry.id)) {
        fileProblems.push(`${formatId}/${file}: id must match <formatId>__<partId>__sNN`);
        continue;
      }
      if (entry.id !== expectedId) {
        fileProblems.push(`${formatId}/${file}: id ${entry.id} does not match the file path (expected ${expectedId})`);
        continue;
      }
      if (!entry.set || typeof entry.set !== 'object') {
        fileProblems.push(`${formatId}/${file}: missing set`);
        continue;
      }
      if (!byPart.has(partId)) byPart.set(partId, []);
      byPart.get(partId)!.push({ id: entry.id, set: entry.set, file });
    }
    for (const p of fileProblems) lines.push(p);
    if (fileProblems.length > 0) ok = false;

    let formatItems = 0;
    for (const partId of [...byPart.keys()].sort()) {
      const label = `${formatId}/${partId}`;
      const part = format.parts.find((p) => p.id === partId);
      if (!part) {
        ok = false;
        lines.push(`${label}: the format has no part ${partId}`);
        continue;
      }
      const problems: string[] = [];
      const warnings: string[] = [];
      const incoming = byPart.get(partId)!;
      const incomingIds = new Set(incoming.map((i) => i.id));
      const seenHash = new Map<string, string>();
      for (const [setId, h] of audioHashes) if (!incomingIds.has(setId)) seenHash.set(h, setId);
      for (const { id, set } of incoming) {
        const found = teilSetProblems(set, part);
        if ('instruction' in (set as object)) found.push('Teil sets are German-only and cannot have an instruction');
        const c = set.content as { answers?: unknown[]; allowNone?: unknown };
        if (set.taskType === 'matching') {
          if (typeof c.allowNone !== 'boolean') found.push('matching needs a boolean allowNone');
          else if (!c.allowNone && Array.isArray(c.answers) && c.answers.some((a) => a === null)) found.push('allowNone is false but an answer is none');
        }
        if (set.taskType === 'audio_questions') {
          const audio = audioContentProblems(set.content, { part, germanOnlyQuestions: true });
          found.push(...audio.errors);
          for (const w of audio.warnings) warnings.push(`${id}: ${w}`);
          const h = transcriptHashOf(set.content);
          if (h) {
            const other = seenHash.get(h);
            if (other) found.push(`the transcript is identical to ${other}'s`);
            else seenHash.set(h, id);
          }
        }
        if (set.taskType === 'letter' && found.length === 0) {
          // Bundled sets that stay, then the incoming sets before this one (each pair is reported once).
          const kept = Object.values(existingSets(dataRoot, formatId, partId)).filter((b) => !incomingIds.has(b.id));
          const before = incoming.slice(0, incoming.findIndex((x) => x.id === id));
          warnings.push(...letterWarnings(id, set, [...kept, ...before]));
        }
        for (const f of [...new Set(found)]) problems.push(`${id}: ${f}`);
      }
      if (warnings.length > 0) lines.push(`${label}: ${warnings.length} warning(s)`, ...warnings.map((w) => `  warning: ${w}`));
      if (problems.length > 0) {
        ok = false;
        lines.push(`${label}: ${problems.length} problem(s)`, ...problems.map((p) => `  ${p}`));
        continue;
      }

      const outPath = join(dataRoot, 'teil-sets', formatId, `${partId}.json`);
      const existing = existsSync(outPath) ? readJson<BundledSetFile>(outPath) : null;
      const merged = new Map((existing?.sets ?? []).map((s) => [s.id, s]));
      for (const { id, set } of incoming) merged.set(id, { id, set });
      const sets = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
      // I11: bump the version when the sets change, so loadBundled reloads the part on installs that have it.
      const changed = !existing || canonical(existing.sets) !== canonical(sets);
      let version = existing?.version ?? '1';
      if (existing && changed) {
        const n = Number(existing.version);
        if (!/^\d+$/.test(existing.version) || !Number.isSafeInteger(n)) {
          ok = false;
          lines.push(`${label}: the bundled version "${existing.version}" is not a whole number; cannot bump it`);
          continue;
        }
        version = String(n + 1);
      }
      const file: BundledSetFile = { formatId, partId, version, sets };
      if (!opts.checkOnly && changed) {
        mkdirSync(join(dataRoot, 'teil-sets', formatId), { recursive: true });
        writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
      }
      formatItems += sets.length * part.items;
      if (part.taskType === 'audio_questions') listeningSets.set(`${formatId}/${partId}`, sets.length);
      if (part.taskType === 'letter') {
        const tasks = sets.reduce((n, s) => n + ((s.set.content as LetterContent).tasks?.length ?? 0), 0);
        letterSets.set(`${formatId}/${partId}`, { sets: sets.length, tasks });
      }
      const versionNote = !changed ? `, unchanged (version ${version})` : existing ? `, version ${existing.version} -> ${version}` : `, version ${version}`;
      lines.push(`${label}: ${sets.length} sets OK${versionNote}`);
    }
    itemCounts[formatId] = formatItems;
    lines.push(`${formatId}: ${formatItems} items in total`);
  }
  if (formatIds.length === 0) {
    ok = false;
    lines.push('no format folders found in the work folder');
  }
  lines.push(...letterTotals(dataRoot, formatIds, letterSets));
  lines.push(...listeningTotals(dataRoot, formatIds, listeningSets));
  return { ok, lines, itemCounts };
}

// The bundled sets of a part (the file on disk), by set id.
function existingSets(dataRoot: string, formatId: string, partId: string): Record<string, { id: string; set: TeilSetContent }> {
  const path = join(dataRoot, 'teil-sets', formatId, `${partId}.json`);
  if (!existsSync(path)) return {};
  try {
    return Object.fromEntries((readJson<BundledSetFile>(path).sets ?? []).map((s) => [s.id, s]));
  } catch {
    return {};
  }
}

// Letter sets (and tasks) per track, over every letter part of every format of a touched track, against the target.
function letterTotals(dataRoot: string, formatIds: string[], thisRun: Map<string, { sets: number; tasks: number }>): string[] {
  const tracks = [...new Set(formatIds.map((f) => f.split('-')[0]).filter((t) => t in EXPECTED_LETTER_SETS))].sort();
  const out: string[] = [];
  const formatsDir = join(dataRoot, 'exam-formats');
  if (!existsSync(formatsDir)) return out;
  for (const track of tracks) {
    let sets = 0;
    let tasks = 0;
    for (const f of readdirSync(formatsDir).filter((n) => n.startsWith(`${track}-`) && n.endsWith('.json')).sort()) {
      const format = readJson<ExamFormat>(join(formatsDir, f));
      for (const part of format.parts.filter((p) => p.taskType === 'letter')) {
        let c = thisRun.get(`${format.id}/${part.id}`);
        if (!c) {
          const list = Object.values(existingSets(dataRoot, format.id, part.id));
          c = { sets: list.length, tasks: list.reduce((n, s) => n + ((s.set.content as LetterContent).tasks?.length ?? 0), 0) };
        }
        sets += c.sets;
        tasks += c.tasks;
      }
    }
    out.push(`letters ${TRACK_NAMES[track]}: ${sets} of ${EXPECTED_LETTER_SETS[track]} sets (${tasks} tasks)`);
  }
  return out;
}

// Listening items per track (every listening part of every format of a touched track) against the target.
function listeningTotals(dataRoot: string, formatIds: string[], thisRun: Map<string, number>): string[] {
  const tracks = [...new Set(formatIds.map((f) => f.split('-')[0]).filter((t) => t in EXPECTED_LISTENING_ITEMS))].sort();
  const out: string[] = [];
  const formatsDir = join(dataRoot, 'exam-formats');
  if (!existsSync(formatsDir)) return out;
  for (const track of tracks) {
    let items = 0;
    for (const f of readdirSync(formatsDir).filter((n) => n.startsWith(`${track}-`) && n.endsWith('.json')).sort()) {
      const format = readJson<ExamFormat>(join(formatsDir, f));
      for (const part of format.parts.filter((p) => p.taskType === 'audio_questions')) {
        const key = `${format.id}/${part.id}`;
        let count = thisRun.get(key);
        if (count === undefined) {
          const path = join(dataRoot, 'teil-sets', format.id, `${part.id}.json`);
          count = existsSync(path) ? (readJson<BundledSetFile>(path).sets ?? []).length : 0;
        }
        items += count * part.items;
      }
    }
    out.push(`listening ${TRACK_NAMES[track]}: ${items} of ${EXPECTED_LISTENING_ITEMS[track]} items`);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const format = flag('--format');
  const dataRoot = flag('--data-root');
  const ci = args.indexOf('--check-only');
  const checkOnly = ci >= 0;
  if (checkOnly) args.splice(ci, 1);
  const workDir = args[0];
  if (!workDir) {
    console.error('Usage: npx tsx scripts/merge-teil-sets.ts <workDir> [--format <formatId>] [--check-only] [--data-root <dir>]');
    process.exit(2);
  }
  const result = mergeTeilSets({ workDir, format, dataRoot, checkOnly });
  console.log(result.lines.join('\n'));
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && /merge-teil-sets\.ts$/.test(process.argv[1])) main();
