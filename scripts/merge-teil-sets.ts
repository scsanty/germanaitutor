// Merges one-set writer files into the bundled Teil set files and validates them.
// Input:  <workDir>/<formatId>/<partId>__sNN.json, each {"id": "<formatId>__<partId>__sNN", "set": {...}}
// Output: <dataRoot>/teil-sets/<formatId>/<partId>.json (dataRoot defaults to ./data, or $TEIL_DATA_ROOT, or --data-root)
// Run: npx tsx scripts/merge-teil-sets.ts <workDir> [--format <formatId>] [--check-only] [--data-root <dir>]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { teilSetProblems, type BundledSetFile, type TeilSetContent } from '../lib/exam/teilSets';
import type { ExamFormat } from '../lib/exam/formats';

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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function mergeTeilSets(opts: MergeOptions): MergeResult {
  const dataRoot = resolve(opts.dataRoot ?? process.env.TEIL_DATA_ROOT ?? 'data');
  const lines: string[] = [];
  const itemCounts: Record<string, number> = {};
  let ok = true;
  if (!existsSync(opts.workDir)) return { ok: false, lines: [`work folder not found: ${opts.workDir}`], itemCounts };

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
      const incoming = byPart.get(partId)!;
      for (const { id, set } of incoming) {
        const found = teilSetProblems(set, part);
        if ('instruction' in (set as object)) found.push('Teil sets are German-only and cannot have an instruction');
        const c = set.content as { answers?: unknown[]; allowNone?: unknown };
        if (set.taskType === 'matching') {
          if (typeof c.allowNone !== 'boolean') found.push('matching needs a boolean allowNone');
          else if (!c.allowNone && Array.isArray(c.answers) && c.answers.some((a) => a === null)) found.push('allowNone is false but an answer is none');
        }
        for (const f of [...new Set(found)]) problems.push(`${id}: ${f}`);
      }
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
      const file: BundledSetFile = { formatId, partId, version: '1', sets };
      if (!opts.checkOnly) {
        mkdirSync(join(dataRoot, 'teil-sets', formatId), { recursive: true });
        writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
      }
      formatItems += sets.length * part.items;
      lines.push(`${label}: ${sets.length} sets OK`);
    }
    itemCounts[formatId] = formatItems;
    lines.push(`${formatId}: ${formatItems} items in total`);
  }
  if (formatIds.length === 0) {
    ok = false;
    lines.push('no format folders found in the work folder');
  }
  return { ok, lines, itemCounts };
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
    console.error('Usage: npx tsx scripts/merge-teil-sets.ts <workDir> [--format <formatId>] [--check-only]');
    process.exit(2);
  }
  const result = mergeTeilSets({ workDir, format, dataRoot, checkOnly });
  console.log(result.lines.join('\n'));
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && /merge-teil-sets\.ts$/.test(process.argv[1])) main();
