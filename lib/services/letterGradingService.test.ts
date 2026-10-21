import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { readFormat } from '../exam/formats';
import { LESSON_LETTER_RUBRIC, type WritingRubric } from '../writing/rubric';
import type { LetterContent, LetterTask } from '../tasks/letter';
import type { AiRequest, AiResult } from './aiService';
import { gradeLessonLetter, gradeLetter, LETTER_MAX_TOKENS, LETTER_TIMEOUT_MS, type LetterGradingInput } from './letterGradingService';

const task: LetterTask = {
  situation: 'Ihre Freundin hat Sie zum Geburtstag eingeladen. Sie können nicht kommen.',
  leitpunkte: ['Dank für die Einladung', 'Grund für die Absage', 'Vorschlag für ein Treffen'],
  register: 'informal',
  wordTarget: { min: 40, max: 60 },
};
const text = 'Liebe Anna, danke für die Einladung. Ich kann nicht kommen, weil ich habe Arbeit. Bis bald, Tom';

// 7 of 15 points: B (3) + B (3) + C (1) → 47%.
const reply = JSON.stringify({
  marks: [
    { original: 'weil ich habe Arbeit', correction: 'weil ich arbeiten muss', type: 'grammar', category: 'word_order_subclause', reason_en: 'Verb last.', reason_de: 'Verb ans Ende.' },
    { original: 'not in the letter', correction: 'x', type: 'grammar', category: 'other', reason_en: '', reason_de: '' },
  ],
  criteria: [
    { id: 'task', grade: 'B', justification_en: 'One point thin.', justification_de: 'Ein Punkt knapp.' },
    { id: 'communication', grade: 'B', justification_en: 'Fine.', justification_de: 'Gut.' },
    { id: 'accuracy', grade: 'C', justification_en: 'Errors.', justification_de: 'Fehler.' },
  ],
  corrected: 'Liebe Anna, danke für die Einladung. Ich kann nicht kommen, weil ich arbeiten muss. Bis bald, Tom',
  summary_en: 'A good start.',
  summary_de: 'Ein guter Anfang.',
});

const telcRubric = readFormat('telc-b1')!.parts.find((p) => p.id === 'schreiben')!.rubric as WritingRubric;

function setup(result: AiResult = { ok: true, text: reply }) {
  const db = createDbClient(':memory:');
  const generate = vi.fn<(request: AiRequest) => Promise<AiResult>>().mockResolvedValue(result);
  const rows = (sql: string) => db.prepare(sql).all();
  return { db, generate, rows };
}

const input = (over: Partial<LetterGradingInput> = {}): LetterGradingInput => ({
  level: 'A2',
  formatId: 'generic-a2',
  partId: 'schreiben',
  formatName: null,
  rubric: LESSON_LETTER_RUBRIC,
  task,
  text,
  source: 'teil',
  germanOnlyTask: false,
  ...over,
});

const NOTIFICATIONS = "SELECT kind, problem_key, severity, title, body FROM admin_notifications WHERE kind = 'content_issues'";

describe('gradeLetter', () => {
  it('grades a valid reply, asks for 8192 tokens with a 90 s timeout, and logs the placed marks with the given source', async () => {
    const { db, generate, rows } = setup();
    const outcome = await gradeLetter(db, input(), { generate });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.grade).toMatchObject({ points: 7, maxPoints: 15, percent: 47, summary: { en: 'A good start.', de: 'Ein guter Anfang.' } });
    expect(outcome.grade.marks).toHaveLength(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: LETTER_MAX_TOKENS, timeoutMs: LETTER_TIMEOUT_MS }));
    expect(LETTER_MAX_TOKENS).toBe(8192);
    expect(LETTER_TIMEOUT_MS).toBe(90_000);
    expect(rows('SELECT source, category, wrong, "right" AS fix FROM error_log')).toEqual([
      { source: 'teil', category: 'word_order_subclause', wrong: 'weil ich habe Arbeit', fix: 'weil ich arbeiten muss' },
    ]);
  });

  it('stamps the logged marks with the injected clock', async () => {
    const { db, generate, rows } = setup();
    await gradeLetter(db, input(), { generate, now: () => new Date('2026-09-30T08:00:00.000Z') });
    expect(rows('SELECT created_at FROM error_log')).toEqual([{ created_at: '2026-09-30T08:00:00.000Z' }]);
  });

  it('maps a malformed reply to ai_bad_reply and logs nothing', async () => {
    const { db, generate, rows } = setup({ ok: true, text: '{"criteria": []}' });
    expect(await gradeLetter(db, input(), { generate })).toMatchObject({ ok: false, code: 'ai_bad_reply' });
    expect(rows('SELECT * FROM error_log')).toEqual([]);
  });

  it('passes a provider failure through', async () => {
    const { db, generate } = setup({ ok: false, error: 'timed out', code: 'ai_failed', params: { detail: 'timed out' } });
    expect(await gradeLetter(db, input(), { generate })).toEqual({ ok: false, error: 'timed out', code: 'ai_failed', params: { detail: 'timed out' } });
  });

  it('refuses a whitespace-only letter before any AI call', async () => {
    const { db, generate } = setup();
    expect(await gradeLetter(db, input({ text: '  \n\t ' }), { generate })).toMatchObject({ ok: false, code: 'bad_request' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('grades with the rubric only when the anchors are missing, and raises one content_issues notice per part (S3)', async () => {
    const { db, generate, rows } = setup();
    // No anchor file, whatever is bundled.
    const noAnchors = { generate, readAnchors: () => null };
    expect((await gradeLetter(db, input(), noAnchors)).ok).toBe(true);
    expect((await gradeLetter(db, input(), noAnchors)).ok).toBe(true);

    expect(generate.mock.calls[0][0].systemPrompt).not.toContain('Reference letters');
    expect(rows(NOTIFICATIONS)).toEqual([
      {
        kind: 'content_issues',
        problem_key: 'writing_anchors:generic-a2/schreiben',
        severity: 'info',
        title: 'Writing anchors missing',
        body: 'Grading generic-a2/schreiben used the rubric only: the anchor file is missing or invalid.',
      },
    ]);
  });

  it('puts the selected anchors in the prompt when the part has them, with no notice', async () => {
    const { db, generate, rows } = setup();
    const outcome = await gradeLetter(db, input({ formatId: 'telc-b1', partId: 'schreiben', rubric: telcRubric, formatName: 'telc Deutsch B1' }), {
      generate,
    });
    // The telc reply lacks the telc criteria, so it's a bad reply; the prompt is what's checked here.
    expect(outcome).toMatchObject({ ok: false, code: 'ai_bad_reply' });
    const prompt = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain('Reference letters');
    expect(prompt.match(/Reference \d:/g)).toHaveLength(3);
    expect(rows(NOTIFICATIONS)).toEqual([]);
  });

  it('uses the fallback part’s anchors when the first part has none, with no notice', async () => {
    const { db, generate, rows } = setup();
    await gradeLetter(db, input({ formatId: 'goethe-a2', partId: 'schreiben-2', fallback: { formatId: 'telc-b1', partId: 'schreiben' } }), {
      generate,
    });
    expect(generate.mock.calls[0][0].systemPrompt).toContain('Reference letters');
    expect(rows(NOTIFICATIONS)).toEqual([]);
  });
});

describe('gradeLessonLetter', () => {
  const content: LetterContent = { instruction: { en: 'Write to your friend.', de: 'Schreib deiner Freundin.' }, tasks: [task, { ...task, situation: 'Aufgabe B' }] };

  it('grades the chosen task with the lesson rubric, the lesson instruction, and source lesson', async () => {
    const { db, generate, rows } = setup();
    const outcome = await gradeLessonLetter(db, { level: 'B1', track: 'telc', content, answer: { type: 'letter', taskIndex: 1, text } }, { generate });

    expect(outcome).toMatchObject({ ok: true, grade: { percent: 47 } });
    const prompt = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain('for a lesson');
    expect(prompt).toContain('Situation: Aufgabe B');
    expect(prompt).toContain('Instructions the learner saw: Write to your friend.');
    expect(prompt).toContain('task (Task completion)');
    // telc B1's writing part has anchors, graded on the exam rubric: shown by name, never as reply ids.
    expect(prompt).toContain('Reference letters');
    expect(prompt).toContain('Grades (on the exam rubric): Aufgabenbewältigung A');
    expect(prompt).toContain('Reply with exactly these criterion ids: task, communication, accuracy.');
    expect(prompt).not.toContain('Grades: aufgabe');
    expect(rows('SELECT DISTINCT source FROM error_log')).toEqual([{ source: 'lesson' }]);
  });

  it('takes the anchors from the format’s last letter part, skipping form (cloze) parts (B5)', async () => {
    const { db, generate, rows } = setup();
    const readAnchors = vi.fn(() => null);
    await gradeLessonLetter(db, { level: 'A1', track: 'telc', content, answer: { type: 'letter', taskIndex: 0, text } }, { generate, readAnchors });
    // telc A1's last letter part first, then the NaDoch fallback; neither has anchors here, so one notice for the primary.
    expect(readAnchors.mock.calls).toEqual([
      ['telc-a1', 'schreiben-2'],
      ['generic-a1', 'schreiben'],
    ]);
    expect(rows(NOTIFICATIONS)).toMatchObject([{ problem_key: 'writing_anchors:telc-a1/schreiben-2' }]);
  });

  it('uses the NaDoch fallback’s anchors when the track part has none, with no notice (B5)', async () => {
    const { db, generate, rows } = setup();
    const graded = (letter: string, g: 'A' | 'D') => ({ task, letter, grades: { aufgabe: g, gestaltung: g, richtigkeit: g }, justification: `Alles ${g}.` });
    const readAnchors = vi.fn((formatId: string) => (formatId === 'generic-a1' ? [graded('Fallback-Brief A', 'A'), graded('Fallback-Brief D', 'D')] : null));
    await gradeLessonLetter(db, { level: 'A1', track: 'telc', content, answer: { type: 'letter', taskIndex: 0, text } }, { generate, readAnchors });
    const prompt = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain('Letter: Fallback-Brief A');
    expect(prompt).toContain('Letter: Fallback-Brief D');
    expect(rows(NOTIFICATIONS)).toEqual([]);
  });

  it('refuses a task index the content does not have, before any AI call', async () => {
    const { db, generate } = setup();
    expect(
      await gradeLessonLetter(db, { level: 'B1', track: 'telc', content, answer: { type: 'letter', taskIndex: 2, text } }, { generate })
    ).toMatchObject({ ok: false, code: 'bad_request' });
    expect(generate).not.toHaveBeenCalled();
  });
});
