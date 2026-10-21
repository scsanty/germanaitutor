// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeLessonExercises } from './merge-lesson-exercises';

const STEM = 'telc-b1';
const READING = 'b1-telc-reading-teil1-headline-matching';
const LISTEN = 'b1-telc-listening-teil1-news-broadcasts'; // ex0, ex1 print audio; ex2 is a strategy fill_blank
let root: string;
let work: string;

const matching = (tag = 'A') => ({
  type: 'matching',
  content: {
    instruction: { en: 'Match the headlines.', de: 'Ordnen Sie die Überschriften zu.' },
    items: [`Text ${tag}1`, `Text ${tag}2`],
    targets: ['Überschrift a', 'Überschrift b', 'Überschrift c'],
    answers: [0, 2],
    allowNone: false,
  },
});
const passage = {
  type: 'passage_questions',
  content: { passage: 'Anna wohnt in Köln.', questions: [{ question: 'Wo wohnt Anna?', options: ['Köln', 'Bonn'], correctIndex: 0 }] },
};

const seedPath = () => join(root, 'curriculum-seed', `${STEM}.json`);
const seed = () => JSON.parse(readFileSync(seedPath(), 'utf8'));
const exercisesOf = (id: string) => seed().exercises.filter((e: { lessonId: string }) => e.lessonId === id);
function draft(lessonId: string, items: unknown, stem = STEM) {
  mkdirSync(join(work, stem), { recursive: true });
  writeFileSync(join(work, stem, `${lessonId}.json`), JSON.stringify(items));
}
const audio = (topic = 'Straßenfest') => ({
  type: 'audio_questions',
  instruction: { en: 'Listen and decide: true or false?', de: 'Hören Sie und entscheiden Sie: richtig oder falsch?' },
  content: {
    transcript: `@filter radio\n[Sprecherin f] Das ${topic} findet dieses Jahr in der Stadthalle statt.\n[Sprecher m] Am Nachmittag wird es warm und sonnig.`,
    questions: [
      { question: `Das ${topic} fällt aus.`, options: ['Richtig', 'Falsch'], correctIndex: 1, evidence: 'in der Stadthalle statt' },
      { question: 'Am Nachmittag regnet es.', options: ['Richtig', 'Falsch'], correctIndex: 1, evidence: 'warm und sonnig' },
    ],
  },
});
const run = (extra: { checkOnly?: boolean; seed?: string; complete?: boolean } = {}) => mergeLessonExercises({ workDir: work, dataRoot: root, ...extra });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lesson-root-'));
  work = mkdtempSync(join(tmpdir(), 'lesson-work-'));
  mkdirSync(join(root, 'curriculum-seed'), { recursive: true });
  // A trimmed copy of the pre-conversion telc-b1 seed (git 56d7a19): one grammar, one reading and one
  // still-unconverted listening lesson, so these tests don't depend on the live seed's content.
  cpSync(join(process.cwd(), 'test', 'fixtures', 'curriculum-seed', `${STEM}.json`), seedPath());
});

describe('merge-lesson-exercises', () => {
  it('continues the lesson numbering, keeps existing exercises and inserts after them', () => {
    const before = exercisesOf(READING);
    const all = seed().exercises.length;
    draft(READING, [matching(), passage]);
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.added).toBe(2);
    const after = exercisesOf(READING);
    expect(after.slice(0, before.length)).toEqual(before);
    const n = before.length;
    expect(after.slice(n).map((e: { id: string }) => e.id)).toEqual([`${READING}__ex${n}`, `${READING}__ex${n + 1}`]);
    expect(after[n].track).toBe('telc');
    expect(seed().exercises).toHaveLength(all + 2);
    const ids = seed().exercises.map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const idx = seed().exercises.findIndex((e: { id: string }) => e.id === `${READING}__ex${n - 1}`);
    expect(seed().exercises[idx + 1].id).toBe(`${READING}__ex${n}`);
  });

  it('is idempotent, ignoring key order', () => {
    draft(READING, [matching(), passage]);
    run();
    const first = readFileSync(seedPath(), 'utf8');
    const reordered = { type: 'matching', content: Object.fromEntries(Object.entries(matching().content).reverse()) };
    draft(READING, [reordered, passage]);
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.added).toBe(0);
    expect(r.lines.join('\n')).toContain('0 added, 0 replaced, 2 already merged');
    expect(readFileSync(seedPath(), 'utf8')).toBe(first);
  });

  it('adds only the new drafts on a partial re-run', () => {
    draft(READING, [matching()]);
    run();
    draft(READING, [matching(), passage]);
    expect(run().added).toBe(1);
  });

  it('rejects a lesson that is not reading', () => {
    const grammar = seed().lessons.find((l: { skill: string }) => l.skill === 'grammar').id;
    const original = readFileSync(seedPath(), 'utf8');
    draft(grammar, [matching()]);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('not reading');
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
  });

  it('rejects an unknown lesson, a bad seed and a non-new type', () => {
    draft('no-such-lesson', [matching()]);
    expect(run().lines.join('\n')).toContain('no such lesson');
    draft('x', [matching()], 'nope-a1');
    expect(run({ seed: 'nope-a1' }).lines.join('\n')).toContain('no such seed file');
    draft(READING, [{ type: 'fill_blank', content: { textWithBlank: 'a ___', correctAnswer: 'b' } }]);
    expect(run({ seed: STEM }).ok).toBe(false);
  });

  it('rejects invalid content and writes nothing, even for the valid drafts', () => {
    const original = readFileSync(seedPath(), 'utf8');
    const bad = matching();
    bad.content.answers = [0, 9];
    draft(READING, [passage, bad]);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('exercise 2');
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
  });

  it('rejects a one-language instruction', () => {
    const bad = matching();
    (bad.content.instruction as { de?: string }).de = '';
    draft(READING, [bad]);
    expect(run().ok).toBe(false);
  });

  it('accepts a top-level instruction on the entry', () => {
    const { instruction, ...content } = matching().content;
    draft(READING, [{ type: 'matching', instruction, content }]);
    expect(run().ok).toBe(true);
    expect(exercisesOf(READING).at(-1).content.instruction).toEqual(instruction);
  });

  it('check-only validates without writing', () => {
    const original = readFileSync(seedPath(), 'utf8');
    draft(READING, [matching()]);
    const r = run({ checkOnly: true });
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
  });

  it('leaves the file byte-identical when there are no drafts, and keeps the formatting after a merge', () => {
    const original = readFileSync(seedPath(), 'utf8');
    mkdirSync(join(work, STEM), { recursive: true });
    expect(run().ok).toBe(true);
    expect(readFileSync(seedPath(), 'utf8')).toBe(original);
    draft(READING, [passage]);
    run();
    const after = readFileSync(seedPath(), 'utf8');
    expect(after).toBe(JSON.stringify(JSON.parse(after), null, 2) + '\n');
    const o = original.split('\n');
    const a = after.split('\n');
    expect(a.slice(0, 5)).toEqual(o.slice(0, 5));
    expect(a.length).toBeGreaterThan(o.length);
  });

  describe('listening lessons and replaces', () => {
    const ids = () => exercisesOf(LISTEN).map((e: { id: string }) => e.id);

    it('replaces the named exercises in place with a new id', () => {
      const all = seed().exercises.length;
      const at = seed().exercises.findIndex((e: { id: string }) => e.id === `${LISTEN}__ex0`);
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      const r = run();
      expect(r.ok).toBe(true);
      expect(r.added).toBe(1);
      expect(r.replaced).toBe(2);
      expect(r.lines).toContain(`${STEM}/${LISTEN}: 1 added, 2 replaced, 0 already merged`);
      expect(ids()).toEqual([`${LISTEN}__ex3`, `${LISTEN}__ex2`]);
      expect(seed().exercises).toHaveLength(all - 1);
      const row = seed().exercises[at];
      expect(row).toMatchObject({ id: `${LISTEN}__ex3`, lessonId: LISTEN, track: 'telc', type: 'audio_questions' });
      expect(row.content.instruction).toEqual(audio().instruction);
    });

    it('is idempotent once the replaced exercises are gone', () => {
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      run();
      const first = readFileSync(seedPath(), 'utf8');
      const r = run();
      expect(r.ok).toBe(true);
      expect(r.lines).toContain(`${STEM}/${LISTEN}: 0 added, 0 replaced, 1 already merged`);
      expect(readFileSync(seedPath(), 'utf8')).toBe(first);
    });

    it('never reuses a replaced id', () => {
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }, { ...audio('Stadtfest') }]);
      expect(run().ok).toBe(true);
      expect(ids()).toEqual([`${LISTEN}__ex3`, `${LISTEN}__ex2`, `${LISTEN}__ex4`]);
    });

    it('fails while another exercise still prints spoken text, and writes nothing', () => {
      const original = readFileSync(seedPath(), 'utf8');
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`] }]);
      const r = run();
      expect(r.ok).toBe(false);
      expect(r.lines.join('\n')).toContain(`${LISTEN}__ex1 still prints spoken text`);
      expect(readFileSync(seedPath(), 'utf8')).toBe(original);
      draft(LISTEN, [audio()]);
      expect(run().lines.join('\n')).toContain(`${LISTEN}__ex0 still prints spoken text`);
    });

    it('allows only audio_questions in a listening lesson', () => {
      draft(LISTEN, [{ ...matching(), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      const r = run();
      expect(r.ok).toBe(false);
      expect(r.lines.join('\n')).toContain('type must be one of audio_questions in a listening lesson');
    });

    it('rejects replaced ids from another lesson, unknown ids and ids claimed twice', () => {
      draft(LISTEN, [{ ...audio(), replaces: [`${READING}__ex0`] }]);
      expect(run().lines.join('\n')).toContain(`replaces ${READING}__ex0, which is not an exercise of this lesson`);
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex9`] }]);
      expect(run().lines.join('\n')).toContain(`replaces ${LISTEN}__ex9, which is not an exercise of this lesson`);
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`] }, { ...audio('Stadtfest'), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      expect(run().lines.join('\n')).toContain(`exercise 2: ${LISTEN}__ex0 is already replaced by exercise 1`);
      draft(LISTEN, [{ ...audio(), replaces: [] }]);
      expect(run().lines.join('\n')).toContain('replaces must be a non-empty array of exercise ids');
    });

    it('fails when the content is already merged but a replaced id remains', () => {
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      run();
      draft(LISTEN, [{ ...audio(), replaces: [`${LISTEN}__ex2`] }]);
      const r = run();
      expect(r.ok).toBe(false);
      expect(r.lines.join('\n')).toContain(`already merged, but ${LISTEN}__ex2 still in the lesson`);
    });

    it('requires evidence and checks it against one transcript line', () => {
      const a = audio();
      delete (a.content.questions[0] as { evidence?: string }).evidence;
      a.content.questions[1].evidence = 'gibt es nicht';
      draft(LISTEN, [{ ...a, replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      const text = run().lines.join('\n');
      expect(text).toContain('exercise 1: question 1: evidence is required');
      expect(text).toContain('exercise 1: question 2: evidence must appear in the transcript');
    });

    it('rejects a one-language instruction on an audio exercise', () => {
      draft(LISTEN, [{ ...audio(), instruction: { en: 'Listen.', de: '' }, replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      expect(run().lines.join('\n')).toContain('instruction needs both English and German');
    });

    it('prints TTS hazards as warnings and still merges', () => {
      const a = audio();
      a.content.transcript = a.content.transcript.replace('Am Nachmittag', 'Um 15:30');
      a.content.questions[1].evidence = 'warm und sonnig';
      draft(LISTEN, [{ ...a, replaces: [`${LISTEN}__ex0`, `${LISTEN}__ex1`] }]);
      const r = run();
      expect(r.ok).toBe(true);
      expect(r.lines.join('\n')).toContain(`${STEM}/${LISTEN}: warning: exercise 1: transcript line 2: TTS hazard, clock time "15:30"`);
    });

    it('lets a reading draft replace a reading exercise too', () => {
      draft(READING, [{ ...matching(), replaces: [`${READING}__ex0`] }]);
      const before = exercisesOf(READING).length;
      const r = run();
      expect(r.ok).toBe(true);
      expect(exercisesOf(READING)).toHaveLength(before);
      expect(exercisesOf(READING)[0].id).toBe(`${READING}__ex${before}`);
    });
  });

  describe('writing lessons', () => {
    // Trimmed fixtures: writing-b1 (a grammar lesson and one B1 writing lesson), writing-a1 (the registration form
    // lesson, in FORM_LESSONS, and a short-note lesson).
    const W_B1 = 'b1-telc-writing-complaint-letter';
    const FORM = 'a1-telc-writing-registration-form';
    const NOTE = 'a1-telc-writing-short-appointment-note';
    const GRAMMAR = 'b1-telc-sprachbausteine-connectors-grammar';
    const B1 = 'writing-b1';
    const A1 = 'writing-a1';
    const seedOf = (stem: string) => JSON.parse(readFileSync(join(root, 'curriculum-seed', `${stem}.json`), 'utf8'));
    const typesOf = (stem: string, id: string) => seedOf(stem).exercises.filter((e: { lessonId: string }) => e.lessonId === id).map((e: { type: string }) => e.type);
    const letterTask = (over: Record<string, unknown> = {}) => ({
      situation: 'Sie haben ein Zimmer im Hotel Sonne gebucht, aber es ist sehr laut.',
      leitpunkte: ['Beschreiben Sie das Problem.', 'Nennen Sie den Grund.', 'Fordern Sie eine Lösung.'],
      register: 'formal',
      wordTarget: { min: 120, max: 180 },
      ...over,
    });
    const letter = (task: Record<string, unknown> = {}, instruction: unknown = { en: 'Write a complaint letter.', de: 'Schreiben Sie eine Beschwerde.' }) => ({
      type: 'letter',
      content: { ...(instruction === null ? {} : { instruction }), tasks: [letterTask(task)] },
    });
    const cloze = (mode = 'typed') => ({
      type: 'cloze',
      content: {
        instruction: { en: 'Fill in the form.', de: 'Füllen Sie das Formular aus.' },
        text: 'Name: {{1}}',
        gaps: [mode === 'typed' ? { mode: 'typed', answer: 'Anna' } : { mode: 'select', options: ['Anna', 'Bob'], correctIndex: 0 }],
      },
    });
    const text = (r: { lines: string[] }) => r.lines.join('\n');

    beforeEach(() => {
      for (const stem of [B1, A1]) cpSync(join(process.cwd(), 'test', 'fixtures', 'curriculum-seed', `${stem}.json`), join(root, 'curriculum-seed', `${stem}.json`));
    });

    it('merges a clean letter into a writing lesson', () => {
      draft(W_B1, [letter()], B1);
      const r = run();
      expect(r.ok).toBe(true);
      expect(r.added).toBe(1);
      expect(typesOf(B1, W_B1)).toEqual(['multiple_choice', 'letter']);
      expect(text(r)).not.toContain('warning: exercise');
    });

    it('requires the instruction in both languages', () => {
      draft(W_B1, [letter({}, null)], B1);
      expect(text(run())).toContain('a letter needs an instruction in English and German');
      draft(W_B1, [letter({}, { en: 'Write.', de: '' })], B1);
      const r = run();
      expect(r.ok).toBe(false);
      expect(text(r)).toContain('instruction needs both English and German');
    });

    it('requires exactly one task', () => {
      draft(W_B1, [{ type: 'letter', content: { instruction: { en: 'Write.', de: 'Schreiben Sie.' }, tasks: [letterTask(), letterTask({ situation: 'Eine andere Lage.' })] } }], B1);
      const r = run();
      expect(r.ok).toBe(false);
      expect(text(r)).toContain('a lesson letter needs exactly 1 task');
    });

    it('requires a register and 3 to 4 Leitpunkte', () => {
      draft(W_B1, [letter({ register: 'casual' })], B1);
      expect(text(run())).toContain('register must be informal, semi_formal or formal');
      draft(W_B1, [letter({ leitpunkte: ['Eins', 'Zwei'] })], B1);
      expect(text(run())).toContain('leitpunkte must be 3 to 4 non-empty strings');
    });

    it('warns on English in the situation and the Leitpunkte, and still merges', () => {
      draft(W_B1, [letter({ situation: 'You booked a room at the Hotel Sonne.', leitpunkte: ['Beschreiben Sie das Problem.', 'Please explain the reason.', 'Fordern Sie eine Lösung.'] })], B1);
      const r = run();
      expect(r.ok).toBe(true);
      expect(text(r)).toContain(`${B1}/${W_B1}: warning: exercise 1: situation: English word(s)`);
      expect(text(r)).toContain(`${B1}/${W_B1}: warning: exercise 1: Leitpunkt 2: English word(s) please`);
    });

    it('warns when the word target is outside the lesson level, and still merges', () => {
      draft(W_B1, [letter({ wordTarget: { min: 10, max: 20 } })], B1);
      const r = run();
      expect(r.ok).toBe(true);
      expect(text(r)).toContain(`${B1}/${W_B1}: warning: exercise 1: wordTarget 10-20 is outside the usual 30-220 words for B1`);
      // Goethe B1 Teil 3 asks 32-48 words: no warning.
      draft(W_B1, [letter({ wordTarget: { min: 32, max: 48 } })], B1);
      expect(text(run())).not.toContain('outside the usual');
    });

    it('refuses a cloze in a letter lesson', () => {
      draft(W_B1, [cloze()], B1);
      const r = run();
      expect(r.ok).toBe(false);
      expect(text(r)).toContain('cloze is for the form lessons only');
    });

    it('lets a form lesson take a typed cloze instead of a letter', () => {
      draft(FORM, [cloze()], A1);
      expect(run().ok).toBe(true);
      expect(typesOf(A1, FORM)).toContain('cloze');
      draft(FORM, [letter({ wordTarget: { min: 24, max: 36 } })], A1);
      const bad = run();
      expect(bad.ok).toBe(false);
      expect(text(bad)).toContain('a form lesson takes a cloze, not a letter');
    });

    it('warns when a form cloze has a gap that is not typed', () => {
      draft(FORM, [cloze('select')], A1);
      const r = run();
      expect(r.ok).toBe(true);
      expect(text(r)).toContain('warning: exercise 1: gap 1 is not typed; form lessons use typed gaps');
    });

    it('reports writing lessons without a letter, and a draft then covers them', () => {
      draft(FORM, [cloze()], A1);
      const r = run();
      expect(r.ok).toBe(true);
      expect(text(r)).toContain(`${A1}/${NOTE}: warning: no letter exercise yet`);
      expect(text(r)).toContain(`${A1}: 1 of 2 writing lessons covered`);
      draft(NOTE, [letter({ register: 'informal', wordTarget: { min: 24, max: 36 } })], A1);
      const fixed = run({ complete: true });
      expect(fixed.ok).toBe(true);
      expect(text(fixed)).toContain(`${A1}: 2 of 2 writing lessons covered`);
      expect(text(fixed)).not.toContain('no letter exercise yet');
    });

    it('makes an uncovered writing lesson an error under --complete, writing nothing', () => {
      draft(FORM, [cloze()], A1);
      const before = readFileSync(join(root, 'curriculum-seed', `${A1}.json`), 'utf8');
      const r = run({ complete: true });
      expect(r.ok).toBe(false);
      expect(text(r)).toContain(`${A1}/${NOTE}: problem: no letter exercise yet`);
      expect(readFileSync(join(root, 'curriculum-seed', `${A1}.json`), 'utf8')).toBe(before);
    });

    it('refuses a lesson whose skill is not supported', () => {
      draft(GRAMMAR, [letter()], B1);
      const r = run();
      expect(r.ok).toBe(false);
      expect(text(r)).toContain('lesson skill is "grammar", not reading, listening or writing');
    });
  });
});
