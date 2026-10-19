// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAudio } from '../audio/audioStore';
import { audioHash, parseTranscript, type ParsedTranscript } from '../audio/transcript';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createExamPracticeService, type ExamPracticeDeps } from './examPracticeService';
import type { AiRequest, AiResult } from './aiService';
import { createTeilSetService } from './teilSetService';

// B2: the service tests use one small fixture set per runnable written part, not the real content.
const SETS_DIR = join(process.cwd(), 'test', 'fixtures', 'teil-sets');
const failing = async (_request: AiRequest): Promise<AiResult> => ({ ok: false, error: 'offline' });

// The speech service is up by default; listening availability tests turn it down (S7: injected, no network).
const SPEECH_UP: ExamPracticeDeps['audio'] = { speechUp: async () => true, cached: () => false };

function setup(generate: ExamPracticeDeps['generate'] = failing, audio: ExamPracticeDeps['audio'] = SPEECH_UP, setsDir = SETS_DIR) {
  const db = createDbClient(':memory:');
  createProfileService(db).updateProfile({ activeTrack: 'telc' });
  createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
  createTeilSetService(db, { setsDir }).loadBundled();
  let now = new Date('2026-09-29T10:00:00Z');
  const service = createExamPracticeService(db, { now: () => now, generate, setsDir, audio });
  return { db, service, advance: (s: number) => (now = new Date(now.getTime() + s * 1000)) };
}

function allRight(db: ReturnType<typeof setup>['db'], setId: string) {
  const { content } = JSON.parse((db.prepare('SELECT content FROM teil_sets WHERE id = ?').get(setId) as { content: string }).content);
  return { type: 'matching', selected: content.answers };
}

describe('examPracticeService', () => {
  it('lists the active format’s parts; Sprachbausteine are mock-only (S10)', async () => {
    const { service } = setup();
    const { format, parts } = await service.overview();
    expect(format?.id).toBe('telc-b1');
    expect(parts.find((p) => p.part.id === 'lesen-1')).toMatchObject({ runnable: true, mockOnly: false, lastPercent: null });
    expect(parts.find((p) => p.part.id === 'hoeren-1')).toMatchObject({ runnable: true, audioUnavailable: false });
    expect(parts.find((p) => p.part.id === 'schreiben')?.runnable).toBe(true);
    expect(parts.find((p) => p.part.id === 'sprechen-1')?.runnable).toBe(false);
    expect(parts.find((p) => p.part.id === 'sprachbausteine-1')).toMatchObject({ runnable: false, mockOnly: true });
  });

  it('scores a submitted Teil by points per item, marks overtime from the server clock, and is idempotent', async () => {
    const { db, service, advance } = setup();
    const run = await service.start('telc-b1', 'lesen-1');
    expect(run.minutes).toBe(20);
    expect(run.mockId).toBeNull();
    expect(JSON.stringify(run.set.view)).not.toContain('answers');
    advance(21 * 60);
    const result = await service.submit(run.attemptId, allRight(db, run.set.id));
    expect(result).toMatchObject({ score: 25, maxScore: 25, overtimeSeconds: 60 });
    expect(result.review).toHaveLength(5);
    expect(result.review[0]).toMatchObject({ index: 0, right: true, correct: 'Überschrift a', answerText: 'Überschrift a', explanation: { en: expect.any(String), de: expect.any(String) } });
    expect(await service.submit(run.attemptId, { type: 'matching', selected: [-1, -1, -1, -1, -1] })).toEqual(result); // Review Focus 1
    expect((await service.overview()).parts.find((p) => p.part.id === 'lesen-1')?.lastPercent).toBe(100);
  });

  it('gives partial points per right item', async () => {
    const { db, service } = setup();
    const run = await service.start('telc-b1', 'lesen-1');
    const right = allRight(db, run.set.id);
    const result = await service.submit(run.attemptId, { ...right, selected: right.selected.map((s: number, i: number) => (i < 3 ? s : -1)) });
    expect(result).toMatchObject({ score: 15, maxScore: 25, overtimeSeconds: 0 });
    expect(result.review[4]).toMatchObject({ right: false, answerText: '' });
  });

  // Review Focus 2
  it('refuses a submit to an attempt abandoned more than 3 hours ago, or one that does not exist', async () => {
    const { db, service, advance } = setup();
    const run = await service.start('telc-b1', 'lesen-1');
    advance(3 * 3600 + 1);
    await expect(service.submit(run.attemptId, allRight(db, run.set.id))).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.submit(9999, allRight(db, run.set.id))).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('refuses parts without a runner, mock-only parts, unknown parts and malformed answers', async () => {
    const { service } = setup();
    await expect(service.start('telc-b1', 'sprechen-1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
    await expect(service.start('telc-b1', 'sprachbausteine-1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
    await expect(service.start('telc-b1', 'nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.start('../../x', 'lesen-1')).rejects.toMatchObject({ kind: 'not_found' });
    const run = await service.start('telc-b1', 'lesen-1');
    await expect(service.submit(run.attemptId, { type: 'matching', selected: [0] })).rejects.toMatchObject({ kind: 'bad_request' });
    // I9: "none" is not an answer when the part has no "x" option.
    await expect(service.submit(run.attemptId, { type: 'matching', selected: [null, 0, 0, 0, 0] })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('turns a part with no usable set into part_unavailable', async () => {
    const { db, service } = setup();
    db.prepare("UPDATE teil_sets SET status = 'rejected' WHERE part_id = 'lesen-1'").run();
    await expect(service.start('telc-b1', 'lesen-1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
  });

  it('averages the last 5 finished attempts per part for readiness (S8)', async () => {
    const { db, service } = setup();
    for (let i = 0; i < 6; i++) {
      const run = await service.start('telc-b1', 'lesen-1');
      const right = allRight(db, run.set.id);
      await service.submit(run.attemptId, i === 0 ? { type: 'matching', selected: right.selected.map(() => -1) } : right);
    }
    const view = service.readiness();
    expect(view).toMatchObject({ formatId: 'telc-b1', formatName: expect.any(String) });
    expect(view.parts.find((p) => p.partId === 'lesen-1')).toMatchObject({ averagePercent: 100, attempts: 5, overtime: false });
    expect(view.parts.find((p) => p.partId === 'lesen-2')).toMatchObject({ averagePercent: null, attempts: 0, overtime: false });
    expect(view.parts.some((p) => p.partId === 'hoeren-1')).toBe(true);
    expect(view.parts.some((p) => p.partId === 'schreiben')).toBe(true);
    expect(view.parts.some((p) => p.partId === 'sprechen-1')).toBe(false);
  });

  it('runs a mock over every runnable written part with one shared timer (B2)', async () => {
    const { db, service, advance } = setup();
    const mock = await service.startMock('telc-b1');
    expect(mock.runs.map((r) => r.part.id)).toEqual(['lesen-1', 'lesen-2', 'lesen-3', 'sprachbausteine-1', 'sprachbausteine-2', 'hoeren-1', 'hoeren-2', 'hoeren-3', 'schreiben']);
    expect(mock.minutes).toBe(150);
    expect(new Set(mock.runs.map((r) => r.startedAt)).size).toBe(1);
    expect(mock.runs.every((r) => r.mockId === mock.mockId)).toBe(true);
    // Overtime runs against the mock's total time, not the part's own minutes.
    advance(30 * 60);
    expect((await service.submit(mock.runs[0].attemptId, allRight(db, mock.runs[0].set.id))).overtimeSeconds).toBe(0);
    advance(121 * 60); // 151 min against the mock's 150
    expect((await service.submit(mock.runs[2].attemptId, { type: 'matching', selected: Array(10).fill(-1) })).overtimeSeconds).toBe(60);
    expect(service.readiness().parts.find((p) => p.partId === 'lesen-3')).toMatchObject({ overtime: true, averagePercent: 0 });
  });

  it('fails the whole mock when a part has no usable set', async () => {
    const { db, service } = setup();
    db.prepare("UPDATE teil_sets SET status = 'rejected' WHERE part_id = 'lesen-3'").run();
    await expect(service.startMock('telc-b1')).rejects.toMatchObject({ kind: 'unavailable' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM teil_attempts').get() as { n: number }).n).toBe(0);
  });

  it('explains an item with one AI call that carries the item, both answers and the stored explanation', async () => {
    const generate = vi.fn(failing);
    const { db, service } = setup(generate);
    const run = await service.start('telc-b1', 'lesen-1');
    await expect(service.explain(run.attemptId, 0, 'Warum?')).rejects.toMatchObject({ kind: 'bad_request' });
    await service.submit(run.attemptId, allRight(db, run.set.id));
    await expect(service.explain(run.attemptId, 5, 'Warum?')).rejects.toMatchObject({ kind: 'bad_request' });

    generate.mockImplementation(async () => ({ ok: true as const, text: '  Weil Text 1 von a handelt.  ' }));
    expect(await service.explain(run.attemptId, 0, 'Why a?')).toEqual({ reply: 'Weil Text 1 von a handelt.' });
    const request = generate.mock.lastCall![0];
    expect(request.systemPrompt).toContain('Reply in the language of the learner');
    expect(request.systemPrompt).toContain('Fixture explanation 1.');
    expect(request.systemPrompt).toContain('Überschrift a');
    expect(request.messages.at(-1)?.content).toBe('Why a?');

    generate.mockImplementation(async () => ({ ok: false as const, error: 'No provider', code: 'no_provider' as const }));
    await expect(service.explain(run.attemptId, 0, 'Why?')).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });
  });
});

// Spec: availability rules for listening parts (Teil practice and mocks), with the real telc B1 Hören 1 set.
describe('examPracticeService listening', () => {
  const REAL = JSON.parse(readFileSync(join(process.cwd(), 'data', 'teil-sets', 'telc-b1', 'hoeren-1.json'), 'utf8'));
  const REAL_SET = REAL.sets[0].set;
  const DOWN = { speechUp: async () => false };
  let dataDir: string;
  let setsDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'gait-listening-'));
    process.env.GAIT_DATA_DIR = dataDir;
    // The reading fixtures plus the real hoeren-1 bundle (no hoeren-2/3 sets).
    setsDir = join(dataDir, 'teil-sets');
    mkdirSync(join(setsDir, 'telc-b1'), { recursive: true });
    for (const part of ['lesen-1', 'lesen-2', 'lesen-3', 'sprachbausteine-1', 'sprachbausteine-2']) {
      cpSync(join(SETS_DIR, 'telc-b1', `${part}.json`), join(setsDir, 'telc-b1', `${part}.json`));
    }
    cpSync(join(process.cwd(), 'data', 'teil-sets', 'telc-b1', 'hoeren-1.json'), join(setsDir, 'telc-b1', 'hoeren-1.json'));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.GAIT_DATA_DIR;
  });

  const hashOf = (set: { content: { transcript: string } }) => audioHash(parseTranscript(set.content.transcript) as ParsedTranscript);
  const cacheRealSet = () => writeAudio(hashOf(REAL_SET), Buffer.from('ogg'));

  it('marks hoeren-1 runnable when its audio is cached, even with the speech service down', async () => {
    cacheRealSet();
    const speechUp = vi.fn(async () => false);
    const { service } = setup(failing, { speechUp }, setsDir);
    const parts = (await service.overview()).parts;
    expect(parts.find((p) => p.part.id === 'hoeren-1')).toMatchObject({ runnable: true, audioUnavailable: false });
    // hoeren-2 has no sets: with the service down it isn't runnable (S10), and neither is the mock.
    expect(parts.find((p) => p.part.id === 'hoeren-2')).toMatchObject({ runnable: false, audioUnavailable: true });
    expect((await service.overview()).mockRunnable).toBe(false);
    const run = await service.start('telc-b1', 'hoeren-1');
    expect(run.set.view).toMatchObject({ audio: { hash: hashOf(REAL_SET), available: true } });
    expect(JSON.stringify(run.set.view)).not.toContain('Stadtbibliothek'); // never the transcript before answering
  });

  it("isn't runnable when the files are missing and the speech service is down, and never asks the AI", async () => {
    const generate = vi.fn(failing);
    const { db, service } = setup(generate, DOWN, setsDir);
    const parts = (await service.overview()).parts;
    expect(parts.find((p) => p.part.id === 'hoeren-1')).toMatchObject({ runnable: false, audioUnavailable: true });
    expect(parts.find((p) => p.part.id === 'lesen-1')).toMatchObject({ runnable: true, audioUnavailable: false });
    await expect(service.start('telc-b1', 'hoeren-1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
    await expect(service.startMock('telc-b1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
    expect(generate).not.toHaveBeenCalled();
    expect((db.prepare('SELECT COUNT(*) AS n FROM teil_attempts').get() as { n: number }).n).toBe(0);
  });

  it('is runnable while the speech service is up, rendering on demand', async () => {
    const { service } = setup(failing, { speechUp: async () => true }, setsDir);
    expect((await service.overview()).parts.find((p) => p.part.id === 'hoeren-1')?.runnable).toBe(true);
    const run = await service.start('telc-b1', 'hoeren-1');
    expect(run.set.view).toMatchObject({ audio: { available: true } });
  });

  it("isn't runnable without any usable set, even with the service up, and asks no AI for one", async () => {
    const generate = vi.fn(failing);
    const { service } = setup(generate, { speechUp: async () => true }, setsDir);
    expect((await service.overview()).parts.find((p) => p.part.id === 'hoeren-2')).toMatchObject({ runnable: false, audioUnavailable: true });
    expect((await service.overview()).mockRunnable).toBe(false);
    await expect(service.start('telc-b1', 'hoeren-2')).rejects.toMatchObject({ code: 'part_unavailable' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('while down, serves only sets with cached audio', async () => {
    cacheRealSet();
    const { db, service } = setup(failing, DOWN, setsDir);
    // An unseen approved set without audio is skipped; the seen cached one is served again.
    db.prepare("INSERT INTO teil_seen (set_id, seen_at) VALUES ('telc-b1__hoeren-1__s01', '2026-01-01T00:00:00.000Z')").run();
    const other = { ...REAL_SET, content: { ...REAL_SET.content, transcript: REAL_SET.content.transcript.replace('Text 5.', 'Text fünf.') } };
    createTeilSetService(db, { setsDir }).upload('telc-b1', 'hoeren-1', [{ id: 'a-uncached', set: other }]);
    expect((await service.start('telc-b1', 'hoeren-1')).set.id).toBe('telc-b1__hoeren-1__s01');
  });

  it('returns the transcript and evidence after submitting, also on a repeated submit', async () => {
    cacheRealSet();
    const { service } = setup(failing, DOWN, setsDir);
    const run = await service.start('telc-b1', 'hoeren-1');
    const answers = { type: 'audio_questions', selected: REAL_SET.content.questions.map((q: { correctIndex: number }) => q.correctIndex) };
    const result = await service.submit(run.attemptId, answers);
    expect(result).toMatchObject({ score: 25, maxScore: 25 });
    expect(result.reveal?.transcript.lines.length).toBeGreaterThan(0);
    expect(result.reveal?.evidence).toEqual(REAL_SET.content.questions.map((q: { evidence: string }) => q.evidence));
    expect((await service.submit(run.attemptId, answers)).reveal).toEqual(result.reveal);
  });

  it('gives the explain prompt the transcript and the item evidence (S11)', async () => {
    cacheRealSet();
    const generate = vi.fn(async (_request: AiRequest): Promise<AiResult> => ({ ok: true, text: 'Weil.' }));
    const { service } = setup(generate, DOWN, setsDir);
    const run = await service.start('telc-b1', 'hoeren-1');
    await service.submit(run.attemptId, { type: 'audio_questions', selected: [0, 0, 0, 0, 0] });
    await service.explain(run.attemptId, 4, 'Warum?');
    const prompt = generate.mock.lastCall![0].systemPrompt;
    expect(prompt).toContain('Stadtbibliothek');
    expect(prompt).toContain('aber das Wasser sollte nicht eiskalt sein');
  });
});

// Writing (B4, S4, S17): a letter part is graded by the AI on the part's rubric; the grade is stored and replayed.
describe('examPracticeService letters', () => {
  const TEXT = 'Sehr geehrte Damen und Herren, ich habe ein Problem mit mein Zimmer. Mit freundlichen Grüßen';
  // aufgabe B (9) + gestaltung B (9) + richtigkeit C (3) = 21 of 45.
  const REPLY = JSON.stringify({
    marks: [{ original: 'mit mein Zimmer', correction: 'mit meinem Zimmer', type: 'grammar', category: 'case_dative', reason_en: 'Dative after mit.', reason_de: 'Dativ nach mit.' }],
    criteria: [
      { id: 'aufgabe', grade: 'B', justification_en: 'One point thin.', justification_de: 'Ein Punkt knapp.' },
      { id: 'gestaltung', grade: 'B', justification_en: 'Fine.', justification_de: 'Gut.' },
      { id: 'richtigkeit', grade: 'C', justification_en: 'Errors.', justification_de: 'Fehler.' },
    ],
    corrected: 'Sehr geehrte Damen und Herren, ich habe ein Problem mit meinem Zimmer. Mit freundlichen Grüßen',
    summary_en: 'A fair letter.',
    summary_de: 'Ein ordentlicher Brief.',
  });
  const graded = async (_request: AiRequest): Promise<AiResult> => ({ ok: true, text: REPLY });
  const letter = (text = TEXT, taskIndex = 1) => ({ type: 'letter', taskIndex, text });
  const row = (db: ReturnType<typeof setup>['db'], id: number) =>
    db.prepare('SELECT score, max_score, overtime_seconds, finished_at, grading_started_at, answers, result FROM teil_attempts WHERE id = ?').get(id) as Record<string, unknown>;

  it('grades a letter on the rubric with the German-only task, logs its marks as teil, and replays the stored grade', async () => {
    const generate = vi.fn(graded);
    const { db, service, advance } = setup(generate);
    const run = await service.start('telc-b1', 'schreiben');
    expect(run.set.view).toMatchObject({ tasks: [{ situation: expect.stringContaining('Aufgabe A') }, { situation: expect.stringContaining('Aufgabe B') }] });
    advance(31 * 60);
    // S4: grading time never counts as overtime.
    generate.mockImplementationOnce(async (request) => {
      advance(80);
      return graded(request);
    });
    const result = await service.submit(run.attemptId, letter());
    expect(result).toMatchObject({ score: 21, maxScore: 45, overtimeSeconds: 60, review: [], text: TEXT, taskIndex: 1 });
    expect(result.letter).toMatchObject({ points: 21, maxPoints: 45, percent: 47, corrected: expect.stringContaining('meinem') });
    expect(result.letter!.marks[0]).toMatchObject({ original: 'mit mein Zimmer', start: TEXT.indexOf('mit mein Zimmer') });
    expect(result.tips).toEqual([{ en: 'Fixture tip 1.', de: 'Fixture-Tipp 1.' }, { en: 'Fixture tip 2.', de: 'Fixture-Tipp 2.' }, { en: 'Fixture tip 3.', de: 'Fixture-Tipp 3.' }]);
    const prompt = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain('Fixture-Aufgabe B');
    expect(prompt).not.toContain('Fixture-Aufgabe A');
    expect(prompt).toContain('telc');
    expect(db.prepare('SELECT source, wrong, "right" FROM error_log').all()).toEqual([{ source: 'teil', wrong: 'mit mein Zimmer', right: 'mit meinem Zimmer' }]);
    expect(row(db, run.attemptId)).toMatchObject({ score: 21, max_score: 45, grading_started_at: null, answers: JSON.stringify(letter()) });

    // Review Focus 1 / B4: a repeated submit replays the stored grade without another AI call.
    expect(await service.submit(run.attemptId, letter('Ganz anders.', 0))).toEqual(result);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await service.overview()).parts.find((p) => p.part.id === 'schreiben')?.lastPercent).toBe(47);
    expect(service.readiness().parts.find((p) => p.partId === 'schreiben')).toMatchObject({ averagePercent: 47, attempts: 1, overtime: true });
  });

  // Review Focus 3: the lock is taken atomically, so a second submit never starts a second grading call.
  it('refuses a concurrent submit with letter_grading while the first is being graded', async () => {
    let release!: (result: AiResult) => void;
    const generate = vi.fn(() => new Promise<AiResult>((resolve) => (release = resolve)));
    const { db, service } = setup(generate);
    const run = await service.start('telc-b1', 'schreiben');
    const first = service.submit(run.attemptId, letter());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await expect(service.submit(run.attemptId, letter())).rejects.toMatchObject({ kind: 'unavailable', code: 'letter_grading' });
    expect(row(db, run.attemptId).grading_started_at).toEqual(expect.any(String));
    release({ ok: true, text: REPLY });
    expect(await first).toMatchObject({ score: 21 });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('treats a lock older than 120 s as stale', async () => {
    const generate = vi.fn(graded);
    const { db, service } = setup(generate);
    const run = await service.start('telc-b1', 'schreiben');
    const lockAt = (secondsAgo: number) =>
      db.prepare('UPDATE teil_attempts SET grading_started_at = ? WHERE id = ?').run(new Date(Date.parse('2026-09-29T10:00:00Z') - secondsAgo * 1000).toISOString(), run.attemptId);
    lockAt(119);
    await expect(service.submit(run.attemptId, letter())).rejects.toMatchObject({ code: 'letter_grading' });
    lockAt(121);
    expect(await service.submit(run.attemptId, letter())).toMatchObject({ score: 21 });
  });

  it('leaves the attempt open and unlocked when grading fails, so it can be resubmitted', async () => {
    const generate = vi.fn(async (_request: AiRequest): Promise<AiResult> => ({ ok: false, error: 'offline', code: 'ai_failed' }));
    const { db, service } = setup(generate);
    const run = await service.start('telc-b1', 'schreiben');
    await expect(service.submit(run.attemptId, letter())).rejects.toMatchObject({ kind: 'ai_failed', code: 'ai_failed' });
    expect(row(db, run.attemptId)).toMatchObject({ finished_at: null, grading_started_at: null, result: null });
    generate.mockImplementationOnce(async () => ({ ok: true, text: 'not json' }));
    await expect(service.submit(run.attemptId, letter())).rejects.toMatchObject({ kind: 'ai_failed', code: 'ai_bad_reply' });
    expect(row(db, run.attemptId)).toMatchObject({ finished_at: null, grading_started_at: null });
    generate.mockImplementationOnce(graded);
    expect(await service.submit(run.attemptId, letter())).toMatchObject({ score: 21 });
  });

  it('scores an empty letter 0 without asking the AI, and refuses a task that does not exist', async () => {
    const generate = vi.fn(graded);
    const { service } = setup(generate);
    const run = await service.start('telc-b1', 'schreiben');
    await expect(service.submit(run.attemptId, letter(TEXT, 2))).rejects.toMatchObject({ kind: 'bad_request' });
    const result = await service.submit(run.attemptId, letter('   ', 0));
    expect(result).toMatchObject({ score: 0, maxScore: 45, text: '   ' });
    expect(result.letter).toMatchObject({ points: 0, percent: 0, marks: [] });
    expect(result.letter!.criteria.map((c) => c.grade)).toEqual(['D', 'D', 'D']);
    expect(generate).not.toHaveBeenCalled();
  });

  it('refuses to explain a letter (S17)', async () => {
    const { service } = setup(graded);
    const run = await service.start('telc-b1', 'schreiben');
    await service.submit(run.attemptId, letter());
    await expect(service.explain(run.attemptId, 0, 'Warum?')).rejects.toMatchObject({ kind: 'bad_request' });
  });

  // Every bundled letter part has a rubric (T10), so each one has a runner.
  it('runs every letter part of a format, now that each has a rubric', async () => {
    const { db, service } = setup();
    createProfileService(db).updateProfile({ activeTrack: 'goethe' });
    const letters = (await service.overview()).parts.filter((p) => p.part.taskType === 'letter');
    expect(letters.map((p) => p.part.id)).toEqual(['schreiben-1', 'schreiben-2', 'schreiben-3']);
    for (const p of letters) expect(p, p.part.id).toMatchObject({ runnable: true, mockOnly: false });
  });
});
