// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audioContentProblems, optionRule, printsAudio, maybePrintsAudio, textCount, ttsHazards } from './audio-content-checks';
import type { ExamFormat, ExamPart } from '../lib/exam/formats';

const formats: ExamFormat[] = readdirSync(join(process.cwd(), 'data', 'exam-formats'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'exam-formats', f), 'utf8')));
const part = (formatId: string, partId: string): ExamPart => formats.find((f) => f.id === formatId)!.parts.find((p) => p.id === partId)!;

const RF = ['Richtig', 'Falsch'];
const NUM = ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];
// A clean five-text Richtig/Falsch set for telc-b1 hoeren-1.
function fiveTexts() {
  const rows = ['@filter radio'];
  NUM.slice(0, 5).forEach((n, i) => {
    rows.push(`[Ansage f] Text ${i + 1}.`, `[Sprecher m] Heute geht es um Thema ${n}, und das ist wichtig.`);
  });
  return {
    transcript: rows.join('\n'),
    questions: NUM.slice(0, 5).map((n) => ({ question: `Es geht um etwas anderes als ${n}.`, options: RF, correctIndex: 1, evidence: `Thema ${n}` })),
  };
}

describe('part rules from the format instructions', () => {
  it('finds the text count of every multi-text listening part', () => {
    expect(textCount(part('telc-b1', 'hoeren-1'))).toBe(5);
    expect(textCount(part('telc-b1', 'hoeren-2'))).toBeNull();
    expect(textCount(part('generic-b2', 'hoeren-1'))).toBe(7); // "Sie hören 7 kurze Texte"
    expect(textCount(part('goethe-a1', 'hoeren-1'))).toBe(6); // "sechs kurze Gespräche"
    expect(textCount(part('goethe-a1', 'hoeren-2'))).toBe(4); // "vier Durchsagen"
    expect(textCount(part('telc-a2', 'hoeren-2'))).toBe(5); // "fünf Informationen aus dem Radio"
    expect(textCount(part('telc-c1', 'hoeren-1'))).toBe(8); // "Meinungen von acht Personen"
  });

  it('reads the option shape', () => {
    expect(optionRule(part('telc-b1', 'hoeren-1'))).toBe('richtig-falsch');
    expect(optionRule(part('goethe-a1', 'hoeren-2'))).toBe('richtig-falsch'); // "Richtig oder Falsch"
    expect(optionRule(part('generic-a1', 'hoeren-2'))).toBe('abc');
    expect(optionRule(part('goethe-b1', 'hoeren-1'))).toBe('richtig-falsch-then-abc');
    expect(optionRule(part('goethe-a2', 'hoeren-4'))).toBe('ja-nein');
    expect(optionRule(part('goethe-c1', 'hoeren-1'))).toBeNull();
  });
});

describe('audioContentProblems', () => {
  const p = part('telc-b1', 'hoeren-1');

  it('passes a clean set with no warnings', () => {
    expect(audioContentProblems(fiveTexts(), { part: p, germanOnlyQuestions: true })).toEqual({ errors: [], warnings: [] });
  });

  it('requires evidence on every question', () => {
    const c = fiveTexts();
    delete (c.questions[1] as { evidence?: string }).evidence;
    c.questions[2].evidence = ' ';
    expect(audioContentProblems(c, { part: p }).errors).toEqual(['question 2: evidence is required', 'question 3: evidence is required']);
  });

  it('rejects evidence found in more than one line', () => {
    const c = fiveTexts();
    c.questions[0].evidence = 'und das ist wichtig';
    expect(audioContentProblems(c, { part: p }).errors[0]).toMatch(/question 1: evidence appears in 5 transcript lines/);
  });

  it('warns when the question repeats the evidence', () => {
    const c = fiveTexts();
    c.questions[0].question = 'Thema eins.';
    expect(audioContentProblems(c, { part: p }).warnings).toContain('question 1: the question repeats the evidence word for word, which gives the answer away');
  });

  it('checks Richtig/Falsch, a/b/c, alternating and Ja/Nein options', () => {
    const c = fiveTexts();
    c.questions[0].options = ['Falsch', 'Richtig'];
    expect(audioContentProblems(c, { part: p }).errors).toEqual(['question 1: this part is Richtig/Falsch; options must be exactly ["Richtig","Falsch"]']);

    const abc = part('generic-a1', 'hoeren-2');
    const one = {
      transcript: '[Anna f] Ich fahre morgen nach Köln.',
      questions: [{ question: 'Wohin fährt Anna?', options: ['Köln', 'Bonn'], correctIndex: 0, evidence: 'nach Köln' }],
    };
    expect(audioContentProblems(one, { part: abc }).errors).toEqual(['question 1: this part is a, b oder c; it needs exactly 3 distinct options']);
    one.questions[0].options = ['Köln', 'Bonn', 'Köln'];
    expect(audioContentProblems(one, { part: abc }).errors).toHaveLength(1);
    one.questions[0].options = ['Köln', 'Bonn', 'Berlin'];
    expect(audioContentProblems(one, { part: abc }).errors).toEqual([]);

    const mixed = { instructions: part('goethe-b1', 'hoeren-1').instructions, items: 2 };
    const two = {
      transcript: '[Anna f] Ich fahre morgen nach Köln.',
      questions: [
        { question: 'Anna fährt nach Köln.', options: RF, correctIndex: 0, evidence: 'nach Köln' },
        { question: 'Wann fährt Anna?', options: RF, correctIndex: 0, evidence: 'morgen' },
      ],
    };
    const mixedErrors = audioContentProblems(two, { part: mixed }).errors;
    expect(mixedErrors).toContain('question 2: this part alternates Richtig/Falsch then a, b oder c; it needs exactly 3 distinct options');
    expect(mixedErrors.filter((e) => e.startsWith('question 1'))).toEqual([]);

    const jaNein = { ...one, questions: [{ ...one.questions[0], options: ['Richtig', 'Falsch'] }] };
    expect(audioContentProblems(jaNein, { part: part('goethe-a2', 'hoeren-4') }).errors).toEqual(['question 1: this part is Ja/Nein; options must be exactly ["Ja","Nein"]']);
  });

  it('skips the format checks for lessons, which have no part', () => {
    const c = fiveTexts();
    c.questions[0].options = ['a', 'b', 'c', 'd'];
    expect(audioContentProblems(c).errors).toEqual([]);
  });

  it('needs one numbered marker line per text in a multi-text part', () => {
    const c = fiveTexts();
    c.transcript = c.transcript.replace('[Ansage f] Text 5.\n', '');
    expect(audioContentProblems(c, { part: p }).errors).toEqual([
      'this part has 5 texts; the transcript needs 5 marker lines like "[Ansage f] Text 1.", found 4',
    ]);
    const swapped = fiveTexts();
    swapped.transcript = swapped.transcript.replace('Text 2.', 'Text X.').replace('Text 3.', 'Text 2.').replace('Text X.', 'Text 3.');
    expect(audioContentProblems(swapped, { part: p }).errors).toEqual(['marker lines must be numbered Text 1. to Text 5. in order']);
  });

  it('warns when questions leave the text order or a text has no question', () => {
    const c = fiveTexts();
    [c.questions[0], c.questions[1]] = [c.questions[1], c.questions[0]];
    expect(audioContentProblems(c, { part: p }).warnings).toEqual(['questions are not in text order (evidence lines go backwards)']);
    const d = fiveTexts();
    d.questions[4].evidence = 'Thema vier';
    expect(audioContentProblems(d, { part: p }).warnings).toContain('no question has evidence in text 5');
  });

  it('limits speakers per gender, counting the marker speaker', () => {
    const c = fiveTexts();
    c.transcript = c.transcript.replace('[Sprecher m] Heute geht es um Thema zwei', '[Ute f] Heute geht es um Thema zwei')
      .replace('[Sprecher m] Heute geht es um Thema drei', '[Eva f] Heute geht es um Thema drei')
      .replace('[Sprecher m] Heute geht es um Thema vier', '[Ida f] Heute geht es um Thema vier');
    expect(audioContentProblems(c, { part: p }).errors).toEqual(['4 female speakers; at most 3 (voices would repeat)']);
    const m = fiveTexts();
    m.transcript = m.transcript.replace('[Sprecher m] Heute geht es um Thema zwei', '[Max m] Heute geht es um Thema zwei')
      .replace('[Sprecher m] Heute geht es um Thema drei', '[Tom m] Heute geht es um Thema drei');
    expect(audioContentProblems(m, { part: p }).warnings).toEqual([
      "3 male speakers besides the marker speaker; keep at most 2 so voices don't repeat",
    ]);
  });

  it('warns about TTS hazards and English words, but never fails on them', () => {
    const c = fiveTexts();
    c.transcript = c.transcript.replace('und das ist wichtig.', 'um 13:45 kostet es 1,50 € und the ICE fährt z. B. ab.');
    c.questions[1].question = 'What is the price?';
    const r = audioContentProblems(c, { part: p, germanOnlyQuestions: true });
    expect(r.errors).toEqual([]);
    const w = r.warnings.join('\n');
    expect(w).toContain('transcript line 2: TTS hazard, clock time "13:45"');
    expect(w).toContain('currency sign "€"');
    expect(w).toContain('abbreviation "z. B."');
    expect(w).toContain('all-caps abbreviation "ICE"');
    expect(w).toContain('digits "1,50"');
    expect(w).not.toContain('"45"');
    expect(w).toContain('transcript line 2: English word(s) the');
    expect(w).toContain('question 2: English word(s) what, is, the');
    // Marker lines ("Text 1.") are exempt from the lint.
    expect(r.warnings.filter((x) => /transcript line (1|3|5|7|9):/.test(x))).toEqual([]);
  });

  it('skips the line checks when the transcript does not parse', () => {
    const r = audioContentProblems({ transcript: 'no tags here', questions: [{ question: 'x', options: RF, correctIndex: 0, evidence: 'zzz' }] });
    expect(r).toEqual({ errors: [], warnings: [] });
  });
});

describe('ttsHazards', () => {
  it('flags times, money, percent, abbreviations, digits and acronyms', () => {
    expect(ttsHazards('dreizehn Uhr fünfundvierzig, ein Euro fünfzig')).toEqual([]);
    expect(ttsHazards('Gleis 3, ca. 50 %')).toEqual(['percent sign "%"', 'abbreviation "ca."', 'digits "3", "50"']);
    expect(ttsHazards('Nr. 7 in der Hauptstr. 4')).toContain('abbreviation "Nr.", "Hauptstr."');
  });
});

describe('printed audio (B2)', () => {
  it('matches spoken text under a label and "(spoken …)" hints, not strategy hints', () => {
    expect(printsAudio({ question: "Radiomeldung (1x): 'Das Fest fällt aus.' - Aussage: …" })).toBe(true);
    expect(printsAudio({ question: 'Frau: „Ich komme später.“ Mann: …' })).toBe(true);
    expect(printsAudio({ textWithBlank: "Radio: 'Bis ___ Uhr.' (spoken: neunzehn)" })).toBe(true);
    expect(printsAudio({ textWithBlank: 'Die Texte werden nur ___ abgespielt. (number: zweimal)' })).toBe(false);
    expect(printsAudio({ textWithBlank: 'Strategie: Die Texte werden nur ___ abgespielt. (once: einmal)' })).toBe(false);
    expect(maybePrintsAudio({ question: "Debatte (2x): Frau Sommer: 'Mitarbeiter leisten mehr.'" })).toBe(true);
    expect(maybePrintsAudio({ question: 'Was ist eine Debatte?' })).toBe(false);
  });
});
