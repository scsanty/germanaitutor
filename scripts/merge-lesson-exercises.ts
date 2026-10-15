// Merges drafted new-type exercises into the bundled curriculum seeds and validates them.
// Run: npx tsx scripts/merge-lesson-exercises.ts <workDir> [--seed <file-stem>] [--check-only] [--data-root <dir>]
//
// Input:  <workDir>/<seed-stem>/<lessonId>.json, e.g. <workDir>/goethe-b1/b1-goethe-reading-teil2-press-articles.json
//         Each file is an array of exercises WITHOUT ids. An entry is { "type", "content" }:
//           type:    "passage_questions" | "matching" | "cloze"
//           content: the exercise content exactly as stored in the seed. The bilingual instruction lives
//                    INSIDE content as "instruction": { "en": "...", "de": "..." } (both languages or neither).
//         For convenience a top-level "instruction" on the entry is folded into content.instruction.
//         No other keys are allowed. The seed supplies id, lessonId and track.
// Output: <dataRoot>/curriculum-seed/<seed-stem>.json (dataRoot defaults to ./data, or $LESSON_DATA_ROOT, or --data-root).
//
// Per lesson: it must exist and have skill "reading". New ids continue the lesson's "<lessonId>__exN"
// numbering, and the exercises are inserted right after the lesson's last existing exercise. Existing
// exercises are never changed or removed. Every new exercise passes validateExerciseContent (the real
// validators, including the instruction rule), and the merged seed passes the loader's validateSeedFile.
//
// Idempotence: a draft is "already merged" when the lesson already holds an exercise with the same type and
// deep-equal content (object key order ignored). Such drafts are skipped, so re-running adds nothing.
// Nothing is written if any problem is found, and files are only rewritten when something was added.
// The seed is written with JSON.stringify(seed, null, 2) + "\n", which reproduces the shipped files byte for
// byte (the script refuses to write a seed that would not round-trip, so the diff stays minimal).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateExerciseContent } from '../lib/curriculum/exerciseContentValidation';
import { validateSeedFile, type SeedFile } from '../lib/services/curriculumSeedLoader';

export interface MergeOptions {
  workDir: string;
  dataRoot?: string;
  seed?: string;
  checkOnly?: boolean;
}

export interface MergeResult {
  ok: boolean;
  lines: string[];
  added: number;
}

const NEW_TYPES = ['passage_questions', 'matching', 'cloze'];

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const serialize = (seed: unknown) => JSON.stringify(seed, null, 2) + '\n';

export function mergeLessonExercises(opts: MergeOptions): MergeResult {
  const dataRoot = resolve(opts.dataRoot ?? process.env.LESSON_DATA_ROOT ?? 'data');
  const lines: string[] = [];
  let ok = true;
  let added = 0;
  if (!existsSync(opts.workDir)) return { ok: false, lines: [`work folder not found: ${opts.workDir}`], added };

  const stems = readdirSync(opts.workDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && (!opts.seed || d.name === opts.seed))
    .map((d) => d.name)
    .sort();
  if (stems.length === 0) return { ok: false, lines: ['no seed folders found in the work folder'], added };

  const pending: { path: string; text: string }[] = [];

  for (const stem of stems) {
    const seedPath = join(dataRoot, 'curriculum-seed', `${stem}.json`);
    if (!existsSync(seedPath)) {
      ok = false;
      lines.push(`${stem}: no such seed file`);
      continue;
    }
    const original = readFileSync(seedPath, 'utf8');
    const seed = JSON.parse(original) as SeedFile;
    if (serialize(seed) !== original) {
      ok = false;
      lines.push(`${stem}: the seed file does not round-trip through JSON.stringify(..., null, 2); refusing to rewrite it`);
      continue;
    }
    let seedAdded = 0;
    let seedOk = true;

    for (const file of readdirSync(join(opts.workDir, stem)).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) {
      const lessonId = file.slice(0, -'.json'.length);
      const label = `${stem}/${lessonId}`;
      const fail = (msgs: string[]) => {
        seedOk = false;
        lines.push(`${label}: ${msgs.length} problem(s)`, ...msgs.map((m) => `  ${m}`));
      };
      const lesson = seed.lessons.find((l) => l.id === lessonId);
      if (!lesson) { fail(['no such lesson in the seed']); continue; }
      if (lesson.skill !== 'reading') { fail([`lesson skill is "${lesson.skill}", not reading`]); continue; }
      let drafts: unknown;
      try {
        drafts = JSON.parse(readFileSync(join(opts.workDir, stem, file), 'utf8'));
      } catch {
        fail(['not valid JSON']);
        continue;
      }
      if (!Array.isArray(drafts) || drafts.length === 0) { fail(['a draft must be a non-empty array of exercises']); continue; }

      const problems: string[] = [];
      const fresh: { type: string; content: Record<string, unknown> }[] = [];
      const known = new Set(seed.exercises.filter((e) => e.lessonId === lessonId).map((e) => `${e.type}|${canonical(e.content)}`));
      let skipped = 0;
      drafts.forEach((raw, i) => {
        const n = `exercise ${i + 1}`;
        const d = raw as Record<string, unknown>;
        if (!d || typeof d !== 'object' || Array.isArray(d)) { problems.push(`${n}: must be an object`); return; }
        const extra = Object.keys(d).filter((k) => !['type', 'content', 'instruction'].includes(k));
        if (extra.length > 0) { problems.push(`${n}: unexpected key(s) ${extra.join(', ')}`); return; }
        if (typeof d.type !== 'string' || !NEW_TYPES.includes(d.type)) { problems.push(`${n}: type must be one of ${NEW_TYPES.join(', ')}`); return; }
        if (!d.content || typeof d.content !== 'object' || Array.isArray(d.content)) { problems.push(`${n}: content must be an object`); return; }
        let content = d.content as Record<string, unknown>;
        if (d.instruction !== undefined) {
          if (content.instruction !== undefined) { problems.push(`${n}: instruction given both on the entry and in content`); return; }
          content = { instruction: d.instruction, ...content };
        }
        const found = validateExerciseContent(d.type, content);
        if (found.length > 0) { for (const f of found) problems.push(`${n}: ${f}`); return; }
        const key = `${d.type}|${canonical(content)}`;
        if (known.has(key)) { skipped++; return; }
        known.add(key);
        fresh.push({ type: d.type, content });
      });
      if (problems.length > 0) { fail(problems); continue; }

      if (fresh.length > 0) {
        const existing = seed.exercises.filter((e) => e.lessonId === lessonId);
        const re = new RegExp(`^${lessonId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}__ex(\\d+)$`);
        let next = existing.reduce((max, e) => {
          const m = re.exec(e.id);
          return m ? Math.max(max, Number(m[1]) + 1) : max;
        }, 0);
        const rows = fresh.map((f) => ({ id: `${lessonId}__ex${next++}`, lessonId, track: seed.track, type: f.type, content: f.content }));
        let at = -1;
        seed.exercises.forEach((e, idx) => { if (e.lessonId === lessonId) at = idx; });
        if (at < 0) at = seed.exercises.length - 1;
        seed.exercises.splice(at + 1, 0, ...rows);
        seedAdded += rows.length;
      }
      lines.push(`${label}: ${fresh.length} added, ${skipped} already merged`);
    }

    if (seedOk) {
      const whole = validateSeedFile(seed, stem);
      if (whole.length > 0) {
        seedOk = false;
        lines.push(`${stem}: seed validation failed`, ...whole.slice(0, 10).map((m) => `  ${m}`));
      }
    }
    if (!seedOk) { ok = false; continue; }
    if (seedAdded > 0) pending.push({ path: seedPath, text: serialize(seed) });
    added += seedAdded;
  }

  if (ok && !opts.checkOnly) for (const p of pending) writeFileSync(p.path, p.text);
  lines.push(ok ? `${added} exercise(s) ${opts.checkOnly ? 'would be ' : ''}added` : 'problems found; nothing was written');
  return { ok, lines, added: ok ? added : 0 };
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
  const seed = flag('--seed');
  const dataRoot = flag('--data-root');
  const ci = args.indexOf('--check-only');
  const checkOnly = ci >= 0;
  if (checkOnly) args.splice(ci, 1);
  const workDir = args[0];
  if (!workDir) {
    console.error('Usage: npx tsx scripts/merge-lesson-exercises.ts <workDir> [--seed <file-stem>] [--check-only] [--data-root <dir>]');
    process.exit(2);
  }
  const result = mergeLessonExercises({ workDir, seed, dataRoot, checkOnly });
  console.log(result.lines.join('\n'));
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && /merge-lesson-exercises\.ts$/.test(process.argv[1])) main();
