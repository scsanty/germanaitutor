// Merges drafted new-type exercises into the bundled curriculum seeds and validates them.
// Run: npx tsx scripts/merge-lesson-exercises.ts <workDir> [--seed <file-stem>] [--check-only] [--data-root <dir>]
//
// Input:  <workDir>/<seed-stem>/<lessonId>.json, e.g. <workDir>/goethe-b1/b1-goethe-reading-teil2-press-articles.json
//         Each file is an array of exercises WITHOUT ids. An entry is { "type", "content", "replaces"? }:
//           type:     reading lessons: "passage_questions" | "matching" | "cloze"
//                     listening lessons: "audio_questions"
//                     writing lessons: "letter" ("cloze" in the form lessons only, FORM_LESSONS below)
//           content:  the exercise content exactly as stored in the seed. The bilingual instruction lives
//                     INSIDE content as "instruction": { "en": "...", "de": "..." } (both languages or neither).
//           replaces: optional, the ids of existing exercises of this lesson that the new exercise supersedes
//                     (e.g. printed-audio exercises converted into one audio_questions exercise). An id may be
//                     replaced by one draft only.
//         For convenience a top-level "instruction" on the entry is folded into content.instruction.
//         No other keys are allowed. The seed supplies id, lessonId and track.
// Output: <dataRoot>/curriculum-seed/<seed-stem>.json (dataRoot defaults to ./data, or $LESSON_DATA_ROOT, or --data-root).
//
// Per lesson: it must exist and have skill "reading", "listening" or "writing". New ids continue the lesson's
// "<lessonId>__exN" numbering past every existing id (a replaced id is never reused, so the seed loader
// deletes the old row instead of retyping it; preflight B1). A draft with "replaces" takes the position of
// the first replaced exercise, and the replaced exercises are removed from the seed. Drafts without it are
// inserted right after the lesson's last exercise. No other existing exercise is changed or removed.
// Every new exercise passes validateExerciseContent (the real validators, including the instruction rule),
// and the merged seed passes the loader's validateSeedFile. audio_questions exercises also pass
// scripts/audio-content-checks.ts (evidence required, one transcript line each; TTS hazards are warnings).
// A listening lesson with drafts must end up with at least one audio_questions exercise, and none of its
// other exercises may still print spoken text (preflight B2).
//
// A letter needs a German-only situation and Leitpunkte (warnings, via the Reading English-word list), the
// instruction in both languages, exactly 1 task, a register (informal, semi_formal or formal) and a wordTarget
// inside the usual range for the lesson's level (warning). A writing lesson with drafts must end up with at least
// one letter, or in a form lesson (the three typed-gap form parts: goethe-a1/schreiben-1, telc-a1/schreiben-1,
// telc-a2/schreiben-1) at least one cloze; a form lesson takes no letter and other writing lessons no cloze.
//
// Idempotence: a draft is "already merged" when the lesson already holds an exercise with the same type and
// deep-equal content (object key order ignored) and none of its replaced ids remain. Such drafts are skipped,
// so re-running adds nothing.
// Nothing is written if any problem is found, and files are only rewritten when something changed.
// The seed is written with JSON.stringify(seed, null, 2) + "\n", which reproduces the shipped files byte for
// byte (the script refuses to write a seed that would not round-trip, so the diff stays minimal).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateExerciseContent } from '../lib/curriculum/exerciseContentValidation';
import { validateSeedFile, type SeedFile } from '../lib/services/curriculumSeedLoader';
import { audioContentProblems, englishWords, maybePrintsAudio, printsAudio } from './audio-content-checks';

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
  replaced: number;
}

const NEW_TYPES: Record<string, string[]> = {
  reading: ['passage_questions', 'matching', 'cloze'],
  listening: ['audio_questions'],
  writing: ['letter', 'cloze'],
};

// The form lessons teach the typed-gap form parts; they get a typed cloze instead of a letter (preflight B5).
export const FORM_LESSONS = new Set([
  'a1-goethe-writing-teil1-form-completion',
  'a1-telc-writing-registration-form',
  'a2-telc-writing-teil1-form-completion',
]);

// Usual word-target range of a lesson letter, by level (outside it is a warning).
export const LETTER_WORDS: Record<string, { min: number; max: number }> = {
  A1: { min: 15, max: 80 },
  A2: { min: 20, max: 120 },
  B1: { min: 40, max: 220 },
  B2: { min: 80, max: 320 },
  C1: { min: 100, max: 450 },
};

// Extra checks for a drafted writing exercise: errors, and warnings for the reviewer.
function writingChecks(type: string, content: Record<string, unknown>, lessonId: string, level: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const form = FORM_LESSONS.has(lessonId);
  if (type === 'cloze') {
    if (!form) errors.push('cloze is for the form lessons only; a writing lesson takes a letter');
    (Array.isArray(content.gaps) ? content.gaps : []).forEach((g, i) => {
      if ((g as { mode?: unknown })?.mode !== 'typed') warnings.push(`gap ${i + 1} is not typed; form lessons use typed gaps`);
    });
    return { errors, warnings };
  }
  if (form) errors.push('a form lesson takes a cloze, not a letter');
  const instruction = content.instruction as { en?: unknown; de?: unknown } | undefined;
  if (!instruction) errors.push('a letter needs an instruction in English and German');
  const tasks = Array.isArray(content.tasks) ? (content.tasks as Record<string, unknown>[]) : [];
  if (tasks.length !== 1) errors.push('a lesson letter needs exactly 1 task');
  const range = LETTER_WORDS[level];
  const english = (where: string, text: unknown) => {
    const en = typeof text === 'string' ? englishWords(text) : [];
    if (en.length > 0) warnings.push(`${where}: English word(s) ${en.join(', ')}; the situation and Leitpunkte are German-only`);
  };
  for (const t of tasks) {
    english('situation', t?.situation);
    (Array.isArray(t?.leitpunkte) ? t.leitpunkte : []).forEach((l, k) => english(`Leitpunkt ${k + 1}`, l));
    const w = t?.wordTarget as { min?: unknown; max?: unknown } | undefined;
    if (range && typeof w?.min === 'number' && typeof w?.max === 'number' && (w.min < range.min || w.max > range.max)) {
      warnings.push(`wordTarget ${w.min}-${w.max} is outside the usual ${range.min}-${range.max} words for ${level}`);
    }
  }
  return { errors, warnings };
}

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
  let replaced = 0;
  if (!existsSync(opts.workDir)) return { ok: false, lines: [`work folder not found: ${opts.workDir}`], added, replaced };

  const stems = readdirSync(opts.workDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && (!opts.seed || d.name === opts.seed))
    .map((d) => d.name)
    .sort();
  if (stems.length === 0) return { ok: false, lines: ['no seed folders found in the work folder'], added, replaced };

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
    let seedChanged = 0;
    let seedAdded = 0;
    let seedReplaced = 0;
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
      const allowed = NEW_TYPES[lesson.skill];
      if (!allowed) { fail([`lesson skill is "${lesson.skill}", not reading, listening or writing`]); continue; }
      let drafts: unknown;
      try {
        drafts = JSON.parse(readFileSync(join(opts.workDir, stem, file), 'utf8'));
      } catch {
        fail(['not valid JSON']);
        continue;
      }
      if (!Array.isArray(drafts) || drafts.length === 0) { fail(['a draft must be a non-empty array of exercises']); continue; }

      const problems: string[] = [];
      const warnings: string[] = [];
      const fresh: { type: string; content: Record<string, unknown>; replaces: string[] }[] = [];
      const lessonExercises = seed.exercises.filter((e) => e.lessonId === lessonId);
      const lessonIds = new Set(lessonExercises.map((e) => e.id));
      const known = new Set(lessonExercises.map((e) => `${e.type}|${canonical(e.content)}`));
      const claimed = new Map<string, number>();
      let skipped = 0;
      drafts.forEach((raw, i) => {
        const n = `exercise ${i + 1}`;
        const d = raw as Record<string, unknown>;
        if (!d || typeof d !== 'object' || Array.isArray(d)) { problems.push(`${n}: must be an object`); return; }
        const extra = Object.keys(d).filter((k) => !['type', 'content', 'instruction', 'replaces'].includes(k));
        if (extra.length > 0) { problems.push(`${n}: unexpected key(s) ${extra.join(', ')}`); return; }
        if (typeof d.type !== 'string' || !allowed.includes(d.type)) { problems.push(`${n}: type must be one of ${allowed.join(', ')} in a ${lesson.skill} lesson`); return; }
        if (!d.content || typeof d.content !== 'object' || Array.isArray(d.content)) { problems.push(`${n}: content must be an object`); return; }
        let replaces: string[] = [];
        if (d.replaces !== undefined) {
          if (!Array.isArray(d.replaces) || d.replaces.length === 0 || !d.replaces.every((r) => typeof r === 'string' && r.length > 0)) {
            problems.push(`${n}: replaces must be a non-empty array of exercise ids`);
            return;
          }
          replaces = d.replaces as string[];
          const dup = replaces.filter((r, k) => replaces.indexOf(r) !== k);
          if (dup.length > 0) { problems.push(`${n}: replaces lists ${[...new Set(dup)].join(', ')} more than once`); return; }
          const twice = replaces.filter((r) => claimed.has(r));
          if (twice.length > 0) {
            problems.push(`${n}: ${twice.join(', ')} is already replaced by exercise ${claimed.get(twice[0])}`);
            return;
          }
          for (const r of replaces) claimed.set(r, i + 1);
        }
        let content = d.content as Record<string, unknown>;
        if (d.instruction !== undefined) {
          if (content.instruction !== undefined) { problems.push(`${n}: instruction given both on the entry and in content`); return; }
          content = { instruction: d.instruction, ...content };
        }
        const found = validateExerciseContent(d.type, content);
        if (d.type === 'audio_questions') {
          const audio = audioContentProblems(content);
          found.push(...audio.errors);
          for (const w of audio.warnings) warnings.push(`${n}: ${w}`);
        }
        if (lesson.skill === 'writing') {
          const w = writingChecks(d.type, content, lessonId, seed.level);
          found.push(...w.errors);
          for (const m of w.warnings) warnings.push(`${n}: ${m}`);
        }
        if (found.length > 0) { for (const f of found) problems.push(`${n}: ${f}`); return; }
        const key = `${d.type}|${canonical(content)}`;
        const present = replaces.filter((r) => lessonIds.has(r));
        if (known.has(key)) {
          if (present.length > 0) { problems.push(`${n}: already merged, but ${present.join(', ')} still in the lesson`); return; }
          skipped++;
          return;
        }
        if (present.length !== replaces.length) {
          const missing = replaces.filter((r) => !lessonIds.has(r));
          problems.push(`${n}: replaces ${missing.join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not an exercise of this lesson`);
          return;
        }
        known.add(key);
        fresh.push({ type: d.type, content, replaces });
      });
      for (const w of warnings) lines.push(`${label}: warning: ${w}`);
      if (problems.length > 0) { fail(problems); continue; }

      let lessonReplaced = 0;
      if (fresh.length > 0) {
        const re = new RegExp(`^${lessonId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}__ex(\\d+)$`);
        let next = lessonExercises.reduce((max, e) => {
          const m = re.exec(e.id);
          return m ? Math.max(max, Number(m[1]) + 1) : max;
        }, 0);
        const rows = fresh.map((f) => ({
          row: { id: `${lessonId}__ex${next++}`, lessonId, track: seed.track, type: f.type, content: f.content },
          replaces: f.replaces,
        }));
        const gone = new Set(rows.flatMap((r) => r.replaces));
        // A replacing row takes the seed position of the first of its replaced exercises.
        const firstOf = new Map<string, (typeof rows)[number]['row']>();
        for (const r of rows) {
          if (r.replaces.length === 0) continue;
          const first = seed.exercises.find((e) => r.replaces.includes(e.id))!;
          firstOf.set(first.id, r.row);
        }
        const exercises: SeedFile['exercises'] = [];
        for (const e of seed.exercises) {
          const swap = firstOf.get(e.id);
          if (swap) exercises.push(swap);
          if (!gone.has(e.id)) exercises.push(e);
        }
        const appended = rows.filter((r) => r.replaces.length === 0).map((r) => r.row);
        let at = -1;
        exercises.forEach((e, idx) => { if (e.lessonId === lessonId) at = idx; });
        if (at < 0) at = exercises.length - 1;
        exercises.splice(at + 1, 0, ...appended);
        seed.exercises = exercises;
        lessonReplaced = gone.size;
        seedAdded += rows.length;
        seedReplaced += gone.size;
        seedChanged += rows.length;
      }

      // B2: a listening lesson must have audio, and no other exercise may still print what is spoken.
      if (lesson.skill === 'listening') {
        const after = seed.exercises.filter((e) => e.lessonId === lessonId);
        const afterProblems: string[] = [];
        if (!after.some((e) => e.type === 'audio_questions')) afterProblems.push('a listening lesson needs at least one audio_questions exercise');
        for (const e of after) {
          if (e.type === 'audio_questions') continue;
          if (printsAudio(e.content)) afterProblems.push(`${e.id} still prints spoken text; replace it with an audio_questions exercise`);
          else if (maybePrintsAudio(e.content)) lines.push(`${label}: warning: ${e.id} may print spoken text (a quoted utterance); convert it unless it is a phrase or strategy question`);
        }
        if (afterProblems.length > 0) { fail(afterProblems); continue; }
      }
      // A writing lesson needs a letter, or in a form lesson a cloze.
      if (lesson.skill === 'writing') {
        const need = FORM_LESSONS.has(lessonId) ? 'cloze' : 'letter';
        if (!seed.exercises.some((e) => e.lessonId === lessonId && e.type === need)) { fail([`a writing lesson needs at least one ${need} exercise`]); continue; }
      }
      lines.push(`${label}: ${fresh.length} added, ${lessonReplaced} replaced, ${skipped} already merged`);
    }

    if (seedOk) {
      const whole = validateSeedFile(seed, stem);
      if (whole.length > 0) {
        seedOk = false;
        lines.push(`${stem}: seed validation failed`, ...whole.slice(0, 10).map((m) => `  ${m}`));
      }
    }
    if (!seedOk) { ok = false; continue; }
    if (seedChanged > 0) pending.push({ path: seedPath, text: serialize(seed) });
    added += seedAdded;
    replaced += seedReplaced;
  }

  if (ok && !opts.checkOnly) for (const p of pending) writeFileSync(p.path, p.text);
  const would = opts.checkOnly ? 'would be ' : '';
  lines.push(ok ? `${added} exercise(s) ${would}added, ${replaced} ${would}replaced` : 'problems found; nothing was written');
  return { ok, lines, added: ok ? added : 0, replaced: ok ? replaced : 0 };
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
