// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPECTED_LETTER_SETS, mergeTeilSets } from './merge-teil-sets';

const REAL = join(process.cwd(), 'data');
let root: string;
let work: string;

const matchingSet = (text = 'Text') => ({
  taskType: 'matching',
  content: {
    items: Array.from({ length: 5 }, (_, i) => `${text} ${i + 1}`),
    targets: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    answers: [0, 1, 2, 3, 4],
    allowNone: false,
  },
  explanations: Array.from({ length: 5 }, (_, i) => ({ en: `Because ${i}`, de: `Weil ${i}` })),
});

function put(id: string, set: unknown, file = id.split('__').slice(1).join('__') + '.json', format = 'telc-b1') {
  mkdirSync(join(work, format), { recursive: true });
  writeFileSync(join(work, format, file), JSON.stringify({ id, set }));
}
const out = (part = 'lesen-1', format = 'telc-b1') => JSON.parse(readFileSync(join(root, 'teil-sets', format, `${part}.json`), 'utf8'));

const NUM = ['eins', 'zwei', 'drei', 'vier', 'fünf'];
// A clean telc-b1 hoeren-1 set: five texts, Richtig/Falsch. `topic` keeps transcripts distinct.
const audioSet = (topic = 'Bahn') => ({
  taskType: 'audio_questions',
  content: {
    transcript: ['@filter radio', ...NUM.flatMap((n, i) => [`[Ansage f] Text ${i + 1}.`, `[Sprecher m] Thema ${n} betrifft heute die ${topic}.`])].join('\n'),
    questions: NUM.map((n) => ({ question: `Es geht nicht um Thema ${n}.`, options: ['Richtig', 'Falsch'], correctIndex: 1, evidence: `Thema ${n}` })),
  },
  explanations: NUM.map((n) => ({ en: `Text ${n} says so.`, de: `Text ${n} sagt das.` })),
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'teil-root-'));
  work = mkdtempSync(join(tmpdir(), 'teil-work-'));
  cpSync(join(REAL, 'exam-formats'), join(root, 'exam-formats'), { recursive: true });
  cpSync(join(process.cwd(), 'test', 'fixtures', 'teil-sets', 'telc-b1'), join(root, 'teil-sets', 'telc-b1'), { recursive: true });
});

describe('mergeTeilSets', () => {
  it('keeps the existing set and sorts by id', () => {
    put('telc-b1__lesen-1__s03', matchingSet());
    put('telc-b1__lesen-1__s02', matchingSet());
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(true);
    expect(r.lines).toContain('telc-b1/lesen-1: 3 sets OK, version 1 -> 2');
    expect(out().sets.map((s: { id: string }) => s.id)).toEqual(['telc-b1__lesen-1__s01', 'telc-b1__lesen-1__s02', 'telc-b1__lesen-1__s03']);
    expect(r.itemCounts['telc-b1']).toBe(15);
  });

  it('replaces a set with the same id', () => {
    put('telc-b1__lesen-1__s01', matchingSet('Neu'));
    expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(true);
    const o = out();
    expect(o.sets).toHaveLength(1);
    expect(o.sets[0].set.content.items[0]).toBe('Neu 1');
  });

  it('does not write with --check-only', () => {
    put('telc-b1__lesen-1__s02', matchingSet());
    expect(mergeTeilSets({ workDir: work, dataRoot: root, checkOnly: true }).ok).toBe(true);
    expect(out().sets).toHaveLength(1);
  });

  it('rejects an item-count mismatch', () => {
    const s = matchingSet();
    s.content.items.pop();
    s.content.answers.pop();
    s.explanations.pop();
    put('telc-b1__lesen-1__s02', s);
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/5 items/);
    expect(out().sets).toHaveLength(1);
  });

  it('rejects a wrong task type', () => {
    put('telc-b1__lesen-1__s02', { ...matchingSet(), taskType: 'passage_questions' });
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/needs matching/);
  });

  it('rejects a missing explanation', () => {
    const s = matchingSet();
    s.explanations[2] = { en: 'ok', de: ' ' };
    put('telc-b1__lesen-1__s02', s);
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/English and German/);
  });

  it('rejects an id that does not match its path', () => {
    put('telc-b1__lesen-1__s05', matchingSet(), 'lesen-1__s02.json');
    const r = mergeTeilSets({ workDir: work, dataRoot: root });
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/does not match the file path/);
  });

  it('rejects an instruction field', () => {
    const s = matchingSet() as { content: Record<string, unknown> };
    s.content.instruction = { en: 'Match.' };
    put('telc-b1__lesen-1__s02', s);
    expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(false);
  });

  describe('audio_questions', () => {
    it('merges a clean set and bumps the part version', () => {
      put('telc-b1__hoeren-1__s02', audioSet());
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(true);
      expect(r.lines).toContain('telc-b1/hoeren-1: 2 sets OK, version 1 -> 2');
      expect(r.lines.some((l) => l.includes('warning'))).toBe(false);
      const o = out('hoeren-1');
      expect(o.version).toBe('2');
      expect(o.sets.map((s: { id: string }) => s.id)).toEqual(['telc-b1__hoeren-1__s01', 'telc-b1__hoeren-1__s02']);
    });

    it('keeps the version and the file when nothing changed, and bumps again on a content change', () => {
      put('telc-b1__hoeren-1__s02', audioSet());
      mergeTeilSets({ workDir: work, dataRoot: root });
      const path = join(root, 'teil-sets', 'telc-b1', 'hoeren-1.json');
      const first = readFileSync(path, 'utf8');
      const again = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(again.lines).toContain('telc-b1/hoeren-1: 2 sets OK, unchanged (version 2)');
      expect(readFileSync(path, 'utf8')).toBe(first);
      put('telc-b1__hoeren-1__s02', audioSet('Post'));
      expect(mergeTeilSets({ workDir: work, dataRoot: root }).lines).toContain('telc-b1/hoeren-1: 2 sets OK, version 2 -> 3');
      expect(out('hoeren-1').version).toBe('3');
    });

    it('starts a new part file at version 1, and check-only does not bump', () => {
      put('telc-b1__hoeren-1__s02', audioSet());
      expect(mergeTeilSets({ workDir: work, dataRoot: root, checkOnly: true }).lines).toContain('telc-b1/hoeren-1: 2 sets OK, version 1 -> 2');
      expect(out('hoeren-1').version).toBe('1');
      const a1 = {
        taskType: 'audio_questions',
        content: {
          transcript: '[Anna f] Ich fahre morgen mit dem Zug nach Köln.',
          questions: Array.from({ length: 5 }, (_, i) => ({ question: `Frage ${NUM[i]}?`, options: ['Köln', 'Bonn', 'Berlin'], correctIndex: 0, evidence: 'nach Köln' })),
        },
        explanations: NUM.map((n) => ({ en: `Because ${n}.`, de: `Weil ${n}.` })),
      };
      put('generic-a1__hoeren-2__s01', a1, 'hoeren-2__s01.json', 'generic-a1');
      const r = mergeTeilSets({ workDir: work, dataRoot: root, format: 'generic-a1' });
      expect(r.ok).toBe(true);
      expect(r.lines).toContain('generic-a1/hoeren-2: 1 sets OK, version 1');
      expect(out('hoeren-2', 'generic-a1').version).toBe('1');
    });

    it('rejects missing evidence, evidence in two lines and the wrong option shape', () => {
      const s = audioSet();
      delete (s.content.questions[0] as { evidence?: string }).evidence;
      s.content.questions[1].evidence = 'betrifft heute die Bahn';
      s.content.questions[2].options = ['Ja', 'Nein', 'Vielleicht'];
      put('telc-b1__hoeren-1__s02', s);
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(false);
      const text = r.lines.join('\n');
      expect(text).toContain('telc-b1__hoeren-1__s02: question 1: evidence is required');
      expect(text).toMatch(/question 2: evidence appears in 5 transcript lines/);
      expect(text).toContain('question 3: this part is Richtig/Falsch');
      expect(out('hoeren-1').version).toBe('1');
    });

    it('rejects a wrong text count', () => {
      const s = audioSet();
      s.content.transcript = s.content.transcript.replace('[Ansage f] Text 5.\n', '');
      put('telc-b1__hoeren-1__s02', s);
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(false);
      expect(r.lines.join('\n')).toContain('this part has 5 texts; the transcript needs 5 marker lines');
    });

    it('rejects a transcript already used by another set, bundled or incoming', () => {
      put('telc-b1__hoeren-1__s02', audioSet());
      put('telc-b1__hoeren-1__s03', audioSet());
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(false);
      expect(r.lines.join('\n')).toContain("telc-b1__hoeren-1__s03: the transcript is identical to telc-b1__hoeren-1__s02's");

      put('telc-b1__hoeren-1__s03', audioSet('Post'));
      expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(true);
      // Against a set already bundled in another part.
      const other = audioSet('Post');
      rmSync(join(work, 'telc-b1'), { recursive: true });
      put('telc-b1__hoeren-3__s02', other);
      const r2 = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r2.ok).toBe(false);
      expect(r2.lines.join('\n')).toContain("the transcript is identical to telc-b1__hoeren-1__s03's");
      // Replacing a set with its own transcript is fine.
      rmSync(join(work, 'telc-b1'), { recursive: true });
      put('telc-b1__hoeren-1__s03', audioSet('Post'));
      expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(true);
    });

    it('prints TTS hazards as warnings without failing', () => {
      const s = audioSet();
      s.content.transcript = s.content.transcript.replace('betrifft heute die Bahn.', 'beginnt um 13:45 und kostet 5 €.');
      put('telc-b1__hoeren-1__s02', s);
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(true);
      const text = r.lines.join('\n');
      expect(text).toContain('telc-b1/hoeren-1: 3 warning(s)');
      expect(text).toContain('warning: telc-b1__hoeren-1__s02: transcript line 2: TTS hazard, clock time "13:45"');
      expect(text).toContain('currency sign "€"');
    });

    it('prints the listening total for the track against the target', () => {
      put('telc-b1__hoeren-1__s02', audioSet());
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      // Fixtures bundle 1 set each for telc-b1 hoeren-1/2/3 (5 + 10 + 5 items); hoeren-1 now has 2.
      expect(r.lines.at(-1)).toBe('listening telc: 25 of 294 items');
    });
  });

  describe('letter', () => {
    const task = (situation = 'Sie haben ein Zimmer im Hotel Sonne gebucht.', wordTarget = { min: 120, max: 180 }) => ({
      situation,
      leitpunkte: ['Beschreiben Sie das Problem.', 'Nennen Sie den Grund.', 'Fordern Sie eine Lösung.'],
      register: 'formal',
      wordTarget,
    });
    // telc-b1 schreiben: 2 tasks, 3 criteria, word target 120-180.
    const letterSet = (situations = ['Sie haben ein Zimmer im Hotel Sonne gebucht.', 'Ihr Nachbar macht nachts Lärm.']) => ({
      taskType: 'letter',
      content: { tasks: situations.map((s) => task(s)) },
      explanations: ['Aufgabe', 'Gestaltung', 'Richtigkeit'].map((n) => ({ en: `Tip ${n}`, de: `Tipp ${n}` })),
    });
    const putLetter = (n: string, set: unknown) => put(`telc-b1__schreiben__s${n}`, set);

    it('merges a clean letter set and bumps the version on every change', () => {
      putLetter('02', letterSet());
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(true);
      expect(r.lines).toContain('telc-b1/schreiben: 2 sets OK, version 1 -> 2');
      expect(out('schreiben').version).toBe('2');
      putLetter('02', letterSet(['Sie haben ein Zimmer im Hotel Mond gebucht.', 'Ihr Nachbar macht nachts Lärm.']));
      expect(mergeTeilSets({ workDir: work, dataRoot: root }).lines).toContain('telc-b1/schreiben: 2 sets OK, version 2 -> 3');
      expect(out('schreiben').version).toBe('3');
    });

    it('rejects the wrong number of tasks, a wrong wordTarget and the wrong explanation count', () => {
      const one = letterSet();
      one.content.tasks.pop();
      putLetter('02', one);
      const wt = letterSet();
      wt.content.tasks[1].wordTarget = { min: 80, max: 120 };
      putLetter('03', wt);
      const ex = letterSet();
      ex.explanations.pop();
      putLetter('04', ex);
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(false);
      const text = r.lines.join('\n');
      expect(text).toMatch(/s02: the part offers 2 task\(s\), the set has 1/);
      expect(text).toMatch(/s03: task 2: wordTarget must be 120-180/);
      expect(text).toMatch(/s04: .*3 items/);
    });

    it('rejects an instruction on a letter set', () => {
      const s = letterSet() as Record<string, unknown>;
      (s.content as Record<string, unknown>).instruction = { en: 'a', de: 'b' };
      putLetter('02', s);
      expect(mergeTeilSets({ workDir: work, dataRoot: root }).ok).toBe(false);
    });

    it('warns, without failing, on a situation repeated within the part', () => {
      putLetter('02', letterSet());
      putLetter('03', letterSet(['sie haben ein Zimmer im Hotel Sonne gebucht!', 'Sie suchen eine Wohnung.']));
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(true);
      expect(r.lines.join('\n')).toMatch(/warning: telc-b1__schreiben__s03: task 1: the situation repeats telc-b1__schreiben__s02's task 1/);
    });

    it('warns when a situation is already bundled in another set of the part', () => {
      putLetter('02', letterSet());
      mergeTeilSets({ workDir: work, dataRoot: root });
      rmSync(join(work, 'telc-b1'), { recursive: true });
      putLetter('03', letterSet());
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(true);
      expect(r.lines.join('\n')).toMatch(/s03: task 1: the situation repeats telc-b1__schreiben__s02's task 1/);
    });

    it('warns on English words in the situation and the Leitpunkte', () => {
      const s = letterSet();
      s.content.tasks[0].situation = 'Sie schreiben to the hotel and you want a refund.';
      s.content.tasks[1].leitpunkte[2] = 'Please send the invoice.';
      putLetter('02', s);
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      expect(r.ok).toBe(true);
      const text = r.lines.join('\n');
      expect(text).toMatch(/warning: telc-b1__schreiben__s02: task 1 situation: English word\(s\)/);
      expect(text).toMatch(/warning: telc-b1__schreiben__s02: task 2 Leitpunkt 3: English word\(s\) .*please/);
    });

    it('prints the letter total per track against the 66-set target', () => {
      putLetter('02', letterSet());
      putLetter('03', letterSet(['Sie suchen eine Wohnung.', 'Ihr Chef hat Sie gelobt.']));
      const r = mergeTeilSets({ workDir: work, dataRoot: root });
      // 22 letter parts x 3 sets: NaDoch 7 parts (21), Goethe 10 (30), telc 5 (15).
      expect(r.lines).toContain('letters telc: 3 of 15 sets (6 tasks)');
      expect(EXPECTED_LETTER_SETS).toEqual({ generic: 21, goethe: 30, telc: 15 });
    });
  });
});
