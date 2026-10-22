import { describe, it, expect } from 'vitest';
import { pronunciationBand, pronunciationEstimate } from './pronunciation';
import { buildPartnerPrompt, buildSpokenGradingPrompt, parsePartnerReply, parseSpokenGrade, type SpokenAnchor, type SpokenTurn } from './spokenGrading';
import { nextTurnState } from './turnLoop';
import { EXAMINER_VOICE, PARTNER_VOICES } from './voices';
import { spokenAnchorProblems } from './anchors';
import { validateSpokenResponse } from '../curriculum/exerciseContentValidation';
import { selectAnchors } from '../writing/anchors';
import type { ExamPart } from '../exam/formats';
import type { WritingRubric } from '../writing/rubric';
import type { SpokenPartContent } from '../tasks/spoken';

const crit = (id: string, de: string) => ({ id, name: { en: id, de }, points: { A: 10, B: 7, C: 4, D: 0 }, descriptors: { A: 'sehr gut', B: 'gut', C: 'mäßig', D: 'schwach' } });
const rubric: WritingRubric = { criteria: [crit('task', 'Aufgabe'), crit('fluency', 'Flüssigkeit'), crit('pron', 'Aussprache')] };
const part: ExamPart & { rubric: WritingRubric } = {
  id: 'sprechen-1', skill: 'speaking', title: { en: 'Speaking 1', de: 'Mündlicher Ausdruck 1' }, taskType: 'spoken',
  items: 3, points: 30, minutes: 3, instructions: 'Kontaktaufnahme', rubric,
};
const set: SpokenPartContent = {
  situation: 'Sie lernen eine neue Kollegin kennen.',
  materials: [{ title: 'Notizen', points: ['Wohnort', 'Hobbys'] }],
  examinerIntro: 'Guten Tag, bitte stellen Sie sich vor.',
  partner: { name: 'Anna', gender: 'f', profile: 'freundlich, neugierig' },
  turns: 5,
};
const turns: SpokenTurn[] = [
  { speaker: 'examiner', text: 'Guten Tag, bitte stellen Sie sich vor.' },
  { speaker: 'student', text: 'Ich habe in Berlin wohnen.' },
  { speaker: 'partner', text: 'Schön! Und was machst du gern?' },
  { speaker: 'student', text: 'Ich habe gern Fußball gespielt und ich habe in Berlin wohnen.' },
];
const estimate = { score: 62, unclear: ['wohne'] };

describe('pronunciation', () => {
  it('averages word probabilities and lists unclear words once', () => {
    expect(pronunciationEstimate([{ word: 'Ich', probability: 0.95 }, { word: 'wohne', probability: 0.5 }, { word: 'wohne', probability: 0.4 }])).toEqual({ score: 62, unclear: ['wohne'] });
  });
  it('handles no words', () => {
    expect(pronunciationEstimate([])).toEqual({ score: 0, unclear: [] });
  });
  it('has the bands at 85 and 70', () => {
    expect(pronunciationBand(85)).toBe('clear');
    expect(pronunciationBand(84)).toBe('mostly_clear');
    expect(pronunciationBand(70)).toBe('mostly_clear');
    expect(pronunciationBand(69)).toBe('sometimes_unclear');
  });
  it('exports the voices', () => {
    expect(EXAMINER_VOICE).toBe('kerstin');
    expect(PARTNER_VOICES).toEqual({ m: 'thorsten', f: 'ramona' });
  });
});

describe('parseSpokenGrade', () => {
  const reply = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      marks: [
        { original: 'habe in Berlin wohnen', correction: 'wohne in Berlin', type: 'grammar', category: 'perfect_auxiliary', reason_en: 'x', reason_de: 'y' },
        { original: 'habe gern Fußball gespielt', correction: 'spiele gern Fußball', type: 'grammar', category: 'bogus', reason_en: 'x', reason_de: 'y' },
        { original: 'habe in Berlin wohnen', correction: 'wohne in Berlin', type: 'grammar', category: 'other', reason_en: 'x', reason_de: 'y' },
        { original: 'not said', correction: 'x', type: 'grammar', category: 'other', reason_en: 'x', reason_de: 'y' },
      ],
      criteria: [
        { id: 'task', grade: 'B', justification_en: 'ok', justification_de: 'ok' },
        { id: 'fluency', grade: 'C', justification_en: 'ok', justification_de: 'ok' },
        { id: 'pron', grade: 'A', justification_en: 'ok', justification_de: 'ok' },
      ],
      pronunciation_en: 'Mostly clear, tentatively.',
      pronunciation_de: 'Meist klar.',
      summary_en: 'Fine.',
      summary_de: 'Gut.',
      ...over,
    });

  it('scores on the rubric and locates marks per student turn', () => {
    const g = parseSpokenGrade(reply(), turns, rubric, estimate)!;
    expect(g.points).toBe(21);
    expect(g.maxPoints).toBe(30);
    expect(g.percent).toBe(70);
    expect(g.marks.map((m) => m.turnIndex)).toEqual([1, 3, 3]);
    expect(g.marks[1].start).toBe(turns[3].text.indexOf('habe gern Fußball gespielt'));
    expect(g.marks[2].start).toBe(turns[3].text.lastIndexOf('habe in Berlin wohnen'));
    expect(g.marks[1].category).toBe('other');
    expect(g.estimate).toEqual(estimate);
    expect(g.pronunciation).toEqual({ en: 'Mostly clear, tentatively.', de: 'Meist klar.' });
    expect('corrected' in g).toBe(false);
  });
  it('never marks partner or examiner turns', () => {
    const g = parseSpokenGrade(reply({ marks: [{ original: 'Was machst du gern', correction: 'x', type: 'grammar', category: 'other', reason_en: 'x', reason_de: 'y' }] }), turns, rubric, estimate)!;
    expect(g.marks).toEqual([]);
  });
  it('rejects a missing criterion or an invalid grade', () => {
    const o = JSON.parse(reply());
    expect(parseSpokenGrade(JSON.stringify({ ...o, criteria: o.criteria.slice(0, 2) }), turns, rubric, estimate)).toBeNull();
    expect(parseSpokenGrade(JSON.stringify({ ...o, criteria: o.criteria.map((c: { id: string }) => ({ ...c, grade: 'E' })) }), turns, rubric, estimate)).toBeNull();
    expect(parseSpokenGrade('nope', turns, rubric, estimate)).toBeNull();
  });
  it('needs the pronunciation comment only when an estimate was given', () => {
    const noPron = reply({ pronunciation_en: undefined, pronunciation_de: undefined });
    expect(parseSpokenGrade(noPron, turns, rubric, estimate)).toBeNull();
    const g = parseSpokenGrade(noPron, turns, rubric)!;
    expect(g.pronunciation).toBeNull();
    expect(g.estimate).toBeNull();
  });
});

describe('buildSpokenGradingPrompt', () => {
  const anchors: SpokenAnchor[] = [
    { band: 'A', turns: ['Ich wohne in Köln.', 'Ich spiele gern Tennis.', 'Und du?', 'Das klingt toll.'], grades: { task: 'A', fluency: 'A', pron: 'A' }, justification: 'Alles gut.' },
  ];
  const { systemPrompt, messages } = buildSpokenGradingPrompt({ level: 'B1', formatName: 'telc Deutsch B1', part, set, turns, anchors, estimate });
  it('carries the rubric, task, anchors, unclear words and the estimate note', () => {
    expect(systemPrompt).toContain('B1');
    expect(systemPrompt).toContain('telc Deutsch B1');
    expect(systemPrompt).toContain('fluency (fluency)');
    expect(systemPrompt).toContain(set.situation);
    expect(systemPrompt).toContain('Ich wohne in Köln.');
    expect(systemPrompt).toContain('Alles gut.');
    expect(systemPrompt).toContain('wohne');
    expect(systemPrompt).toContain('62');
    expect(systemPrompt).toContain('The pronunciation data is an estimate from speech recognition; comment tentatively.');
    expect(systemPrompt).toContain('task, fluency, pron');
  });
  it('labels the turns in the user message', () => {
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('Learner: Ich habe in Berlin wohnen.');
    expect(messages[0].content).toContain('Partner: Schön!');
    expect(messages[0].content).toContain('Examiner: Guten Tag');
  });
  it('leaves out the pronunciation parts without an estimate', () => {
    const p = buildSpokenGradingPrompt({ level: 'B1', formatName: null, part, set, turns, anchors: [], estimate: null }).systemPrompt;
    expect(p).not.toContain('estimate from speech recognition');
    expect(p).not.toContain('pronunciation_en');
  });
});

describe('partner', () => {
  it('builds a prompt with the level, the profile, the materials and the no-ending rule', () => {
    const { systemPrompt, messages } = buildPartnerPrompt({ level: 'B1', part, set, turns });
    expect(systemPrompt).toContain('B1');
    expect(systemPrompt).toContain('Anna');
    expect(systemPrompt).toContain('freundlich, neugierig');
    expect(systemPrompt).toContain('Wohnort');
    expect(systemPrompt).toContain(set.situation);
    expect(systemPrompt).toContain('Do not end the conversation');
    expect(messages[0].role).toBe('user');
    expect(messages.at(-1)!.role).toBe('user');
    expect(messages.every((m, i) => i === 0 || m.role !== messages[i - 1].role)).toBe(true);
  });
  it('parses a reply', () => {
    expect(parsePartnerReply('{"speaker":"partner","text":" Hallo! "}')).toEqual({ speaker: 'partner', text: 'Hallo!' });
    expect(parsePartnerReply('{"speaker":"examiner","text":"Danke."}')).toEqual({ speaker: 'examiner', text: 'Danke.' });
    expect(parsePartnerReply('{"speaker":"student","text":"x"}')).toBeNull();
    expect(parsePartnerReply('{"speaker":"partner","text":" "}')).toBeNull();
    expect(parsePartnerReply('plain')).toBeNull();
  });
});

describe('nextTurnState', () => {
  it('asks for the student until the maximum, then closes, then is done', () => {
    expect(nextTurnState({ studentTurns: 0, maxTurns: 5, finished: false, closed: false })).toBe('student');
    expect(nextTurnState({ studentTurns: 4, maxTurns: 5, finished: false, closed: false })).toBe('student');
    expect(nextTurnState({ studentTurns: 5, maxTurns: 5, finished: false, closed: false })).toBe('closing');
    expect(nextTurnState({ studentTurns: 2, maxTurns: 5, finished: true, closed: false })).toBe('closing');
    expect(nextTurnState({ studentTurns: 5, maxTurns: 5, finished: true, closed: true })).toBe('done');
  });
});

describe('spoken anchors', () => {
  const g = (task: string, fluency: string, pron: string) => ({ task, fluency, pron }) as never;
  const a = (band: 'A' | 'C' | 'D', grades: never): SpokenAnchor => ({ band, turns: ['a', 'b', 'c', 'd'], grades, justification: 'Weil.' });
  const file = (anchors: SpokenAnchor[]) => ({ formatId: 'telc-b1', partId: 'sprechen-1', anchors });
  const good = [a('A', g('A', 'A', 'A')), a('C', g('C', 'C', 'C')), a('D', g('D', 'D', 'D'))];
  it('accepts three graded anchors with a top and a bottom', () => {
    expect(spokenAnchorProblems(file(good), rubric)).toEqual([]);
  });
  it('names a wrong count, ungraded criteria, bad turns and a missing top', () => {
    expect(spokenAnchorProblems(file(good.slice(0, 2)), rubric)).toContain('expected 3 anchors, found 2');
    expect(spokenAnchorProblems(file([good[0], good[1], a('D', { task: 'D' } as never)]), rubric).some((p) => p.includes('not graded'))).toBe(true);
    expect(spokenAnchorProblems(file([{ ...good[0], turns: ['a'] }, good[1], good[2]]), rubric).some((p) => p.includes('turns'))).toBe(true);
    expect(spokenAnchorProblems(file([good[1], good[1], good[2]]), rubric).some((p) => p.includes('top grade'))).toBe(true);
  });
  it('selectAnchors works on spoken anchors', () => {
    expect(selectAnchors(good, rubric).map((x) => x.band)).toEqual(['A', 'D', 'C']);
  });
});

describe('validateSpokenResponse', () => {
  it('needs a prompt and a model answer', () => {
    expect(validateSpokenResponse({ prompt: 'Stellen Sie sich vor.', modelAnswer: 'Ich heiße Anna.' })).toEqual([]);
    expect(validateSpokenResponse({ prompt: 'x', modelAnswer: 'y', minSeconds: 20, instruction: { en: 'Speak', de: 'Sprechen' } })).toEqual([]);
    expect(validateSpokenResponse({ prompt: ' ', modelAnswer: '' })).toHaveLength(2);
    expect(validateSpokenResponse({ prompt: 'x', modelAnswer: 'y', minSeconds: 0 })).toEqual(['minSeconds must be a positive whole number']);
    expect(validateSpokenResponse({ prompt: 'x', modelAnswer: 'y', instruction: { en: 'Speak' } })).toEqual(['instruction needs both English and German']);
    expect(validateSpokenResponse(null)).toEqual(['content must be an object']);
  });
});
