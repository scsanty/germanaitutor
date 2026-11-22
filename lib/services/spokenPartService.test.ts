// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDbClient } from '../db/client';
import type { SpeechProvider, Transcription } from '../speech/speechProvider';
import type { SpokenAnchor } from '../speaking/spokenGrading';
import type { AiRequest, AiResult } from './aiService';
import { createExamPracticeService, type ExamPracticeDeps } from './examPracticeService';
import { createProfileService } from './profileService';
import { createSpeechClipService } from './speechClipService';
import { CLOSING_LINE, createSpokenPartService } from './spokenPartService';
import { createTeilSetService } from './teilSetService';

const SETS_DIR = join(process.cwd(), 'test', 'fixtures', 'teil-sets');
const INTRO = 'Guten Tag. In diesem Teil planen Sie gemeinsam etwas.';

const ANCHORS: SpokenAnchor[] = [
  { band: 'A', turns: ['a', 'b', 'c', 'd'], grades: { ausdruck: 'A', aufgabe: 'A', richtigkeit: 'A', aussprache: 'A' }, justification: 'Sehr gut.' },
  { band: 'C', turns: ['a', 'b', 'c', 'd'], grades: { ausdruck: 'C', aufgabe: 'C', richtigkeit: 'C', aussprache: 'B' }, justification: 'Mittel.' },
  { band: 'D', turns: ['a', 'b', 'c', 'd'], grades: { ausdruck: 'D', aufgabe: 'D', richtigkeit: 'D', aussprache: 'D' }, justification: 'Schwach.' },
];

const GRADE = JSON.stringify({
  marks: [{ original: 'ich gehe gestern', correction: 'ich bin gestern gegangen', type: 'grammar', category: 'perfect_auxiliary', reason_en: 'Past.', reason_de: 'Vergangenheit.' }],
  criteria: [
    { id: 'ausdruck', grade: 'B', justification_en: 'Fitting phrases.', justification_de: 'Passende Redemittel.' },
    { id: 'aufgabe', grade: 'B', justification_en: 'Good plan.', justification_de: 'Guter Plan.' },
    { id: 'richtigkeit', grade: 'C', justification_en: 'Some errors.', justification_de: 'Einige Fehler.' },
    { id: 'aussprache', grade: 'B', justification_en: 'Clear.', justification_de: 'Deutlich.' },
  ],
  pronunciation_en: 'Mostly clear.',
  pronunciation_de: 'Meist deutlich.',
  summary_en: 'A solid plan.',
  summary_de: 'Ein solider Plan.',
});

type Reply = { speaker: 'partner' | 'examiner'; text: string } | 'fail';

function aiFake(replies: Reply[], grade: () => AiResult = () => ({ ok: true, text: GRADE })) {
  const generate = vi.fn(async (request: AiRequest): Promise<AiResult> => {
    if (request.systemPrompt.startsWith('You grade')) return grade();
    const next = replies.shift();
    if (!next || next === 'fail') return { ok: false, error: 'offline', code: 'ai_failed' };
    return { ok: true, text: JSON.stringify(next) };
  });
  return generate;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gait-spoken-'));
  process.env.GAIT_DATA_DIR = dir;
});
afterEach(() => {
  delete process.env.GAIT_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

function setup(opts: { turns?: number; replies?: Reply[]; grade?: () => AiResult; render?: SpeechProvider['render']; speechUp?: boolean; cached?: boolean; anchors?: SpokenAnchor[] | null } = {}) {
  const db = createDbClient(':memory:');
  createProfileService(db).updateProfile({ activeTrack: 'telc' });
  createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
  createTeilSetService(db, { setsDir: SETS_DIR }).loadBundled();
  db.prepare("UPDATE teil_sets SET content = json_set(content, '$.content.turns', ?) WHERE part_id = 'sprechen-3'").run(opts.turns ?? 2);
  let now = new Date('2026-10-22T10:00:00Z');
  const clock = () => now;
  const provider: SpeechProvider = {
    health: async () => ({ ok: true, voices: [] }),
    render: vi.fn(opts.render ?? (async () => Buffer.from('OggS-rendered'))),
    convert: async (d) => d,
    transcribe: vi.fn(async (): Promise<Transcription> => ({ text: '', language: 'de', duration: 1, words: [] })),
  };
  const generate = aiFake(opts.replies ?? [], opts.grade);
  const clipsDir = join(dir, 'speech-tmp');
  const spokenDeps = { provider, clipsDir, readAnchors: () => (opts.anchors === undefined ? ANCHORS : opts.anchors) };
  const deps: ExamPracticeDeps = { now: clock, generate, setsDir: SETS_DIR, audio: { speechUp: async () => opts.speechUp ?? true, cached: () => opts.cached ?? false }, spoken: spokenDeps };
  const practice = createExamPracticeService(db, deps);
  const spoken = createSpokenPartService(db, { now: clock, generate, ...spokenDeps });
  const clips = createSpeechClipService(db, { provider, dir: clipsDir, now: clock });
  // The student speaks: a recording transcribed into the attempt's scope.
  const say = async (attemptId: number, text: string, words = text.split(' ').map((word) => ({ word, start: 0, end: 1, probability: 0.9 }))) => {
    vi.mocked(provider.transcribe).mockResolvedValueOnce({ text, language: 'de', duration: 2, words });
    return (await clips.transcribeForScope(`teil:${attemptId}`, Buffer.from('rec'), 'audio/webm')).clipId;
  };
  const row = (id: number) =>
    db.prepare('SELECT score, max_score, finished_at, grading_started_at, answers, result FROM teil_attempts WHERE id = ?').get(id) as Record<string, string | number | null>;
  return { db, practice, spoken, clips, provider, generate, say, row, clipsDir, advance: (s: number) => (now = new Date(now.getTime() + s * 1000)) };
}

const voiceOf = (provider: SpeechProvider, call: number) => vi.mocked(provider.render).mock.calls[call][0].segments[0].voice;

describe('spoken Teil', () => {
  it('runs a whole conversation: intro, a partner reply, the examiner closing, then a grade (turns: 2)', async () => {
    const { db, practice, spoken, provider, generate, say, row } = setup({ replies: [{ speaker: 'partner', text: 'Samstag passt mir besser.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    expect(run.spoken).toMatchObject({ state: 'student', set: { partner: { name: 'Jonas', gender: 'm' }, turns: 2 } });
    expect(run.spoken!.turns).toEqual([{ speaker: 'examiner', text: expect.stringContaining(INTRO), clipId: expect.any(String), audio: true }]);
    // B3: rendered directly with the examiner's voice, no filter.
    expect(vi.mocked(provider.render).mock.calls[0][0]).toMatchObject({ filter: 'none', pauseMs: 600, segments: [{ voice: 'kerstin' }] });
    // B2: the attempt keeps clip ids only, never the transcript.
    expect(JSON.parse(row(run.attemptId).answers as string)).toEqual({ type: 'spoken', clipIds: [run.spoken!.turns[0].clipId] });

    const first = await spoken.turn(run.attemptId, await say(run.attemptId, 'Ich schlage Freitag vor'));
    expect(first.state).toBe('student');
    expect(first.turns.map((t) => [t.speaker, t.text])).toEqual([
      ['examiner', expect.stringContaining(INTRO)],
      ['student', 'Ich schlage Freitag vor'],
      ['partner', 'Samstag passt mir besser.'],
    ]);
    expect(voiceOf(provider, 1)).toBe('thorsten');
    const partnerPrompt = generate.mock.calls[0][0];
    expect(partnerPrompt.maxTokens).toBe(300);
    expect(partnerPrompt.messages.at(-1)?.content).toContain('Ich schlage Freitag vor');

    const second = await spoken.turn(run.attemptId, await say(run.attemptId, 'gut, ich gehe gestern einkaufen'));
    expect(second.state).toBe('closing');
    expect(second.turns.at(-1)).toMatchObject({ speaker: 'examiner', text: CLOSING_LINE, audio: true });
    expect(voiceOf(provider, 2)).toBe('kerstin');
    expect(generate).toHaveBeenCalledTimes(1);
    const answers = row(run.attemptId).answers as string;
    expect(JSON.parse(answers).clipIds).toHaveLength(5);
    expect(answers).not.toContain('Freitag');

    const result = await spoken.finish(run.attemptId);
    expect(result).toMatchObject({ score: 15, maxScore: 30, review: [] });
    expect(result.spoken!.grade).toMatchObject({ points: 15, maxPoints: 30, percent: 50, pronunciation: { en: 'Mostly clear.' }, estimate: { score: 90, unclear: [] } });
    expect(result.spoken!.grade.marks).toEqual([expect.objectContaining({ original: 'ich gehe gestern', turnIndex: 3, start: 5 })]);
    expect(result.spoken!.turns).toHaveLength(5);
    expect(result.tips).toHaveLength(4);
    const grading = generate.mock.calls[1][0];
    expect(grading).toMatchObject({ maxTokens: 8192, timeoutMs: 90_000 });
    expect(grading.systemPrompt).toContain('Reference conversations');
    expect(db.prepare('SELECT source, wrong, "right" FROM error_log').all()).toEqual([{ source: 'speaking', wrong: 'ich gehe gestern', right: 'ich bin gestern gegangen' }]);

    // B2: the stored result has no marks, turns or student words.
    const stored = row(run.attemptId);
    expect(stored).toMatchObject({ score: 15, max_score: 30, grading_started_at: null, finished_at: expect.any(String) });
    expect(JSON.parse(stored.result as string)).toEqual({
      criteria: result.spoken!.grade.criteria,
      points: 15,
      maxPoints: 30,
      percent: 50,
      pronunciation: { en: 'Mostly clear.', de: 'Meist deutlich.' },
      summary: { en: 'A solid plan.', de: 'Ein solider Plan.' },
      estimate: { score: 90 },
    });
    expect(stored.result).not.toContain('gestern');
    // A repeated finish replays the stored grade, without the conversation.
    const again = await spoken.finish(run.attemptId);
    expect(again.spoken).toMatchObject({ turns: [], grade: { marks: [], points: 15 } });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  // Review Focus 4: only the student's turn count (or Finish) ends the conversation.
  it('plays an examiner reply mid-way without closing the conversation', async () => {
    const { practice, spoken, provider, say } = setup({ turns: 4, replies: [{ speaker: 'examiner', text: 'Bitte sprechen Sie auch über das Geschenk.' }, { speaker: 'partner', text: 'Gute Idee.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    const first = await spoken.turn(run.attemptId, await say(run.attemptId, 'Wir feiern am Freitag'));
    expect(first.state).toBe('student');
    expect(first.turns.at(-1)).toMatchObject({ speaker: 'examiner', text: 'Bitte sprechen Sie auch über das Geschenk.' });
    expect(voiceOf(provider, 1)).toBe('kerstin');
    const second = await spoken.turn(run.attemptId, await say(run.attemptId, 'Ein Fotoalbum vielleicht'));
    expect(second.state).toBe('student');
    expect(second.turns.at(-1)).toMatchObject({ speaker: 'partner', text: 'Gute Idee.' });
  });

  // Fix round 1 (I1): the speaker is stored on the clip row, so a mid-way examiner line stays the examiner's.
  it('keeps a mid-way examiner line labelled examiner in later prompts, the grading prompt and the finish turns', async () => {
    const { db, practice, spoken, generate, say } = setup({ turns: 3, replies: [{ speaker: 'examiner', text: 'Bitte sprechen Sie auch über das Geschenk.' }, { speaker: 'partner', text: 'Gute Idee.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Wir feiern am Freitag'));
    const second = await spoken.turn(run.attemptId, await say(run.attemptId, 'Ein Fotoalbum vielleicht'));
    expect(second.turns.map((t) => t.speaker)).toEqual(['examiner', 'student', 'examiner', 'student', 'partner']);
    expect(JSON.stringify(generate.mock.calls[1][0].messages)).toContain(JSON.stringify(JSON.stringify({ speaker: 'examiner', text: 'Bitte sprechen Sie auch über das Geschenk.' })).slice(1, -1));
    expect(db.prepare("SELECT role FROM speech_clips WHERE transcript = 'Bitte sprechen Sie auch über das Geschenk.'").get()).toEqual({ role: 'examiner' });
    const result = await spoken.finish(run.attemptId);
    expect(result.spoken!.turns.map((t) => t.speaker)).toEqual(['examiner', 'student', 'examiner', 'student', 'partner', 'examiner']);
    expect(generate.mock.calls.at(-1)![0].messages[0].content).toContain('Examiner: Bitte sprechen Sie auch über das Geschenk.');
  });

  // Fix round 1 (I1): the closing line is recognised by state, never by its text.
  it('treats a partner reply that reads like the closing line as the partner\'s, and still closes on Finish', async () => {
    const { practice, spoken, say } = setup({ turns: 4, replies: [{ speaker: 'partner', text: CLOSING_LINE }, { speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    const first = await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo'));
    expect(first).toMatchObject({ state: 'student' });
    expect(first.turns.at(-1)).toMatchObject({ speaker: 'partner', text: CLOSING_LINE });
    const result = await spoken.finish(run.attemptId);
    expect(result.spoken!.turns.map((t) => t.speaker)).toEqual(['examiner', 'student', 'partner', 'examiner']);
  });

  // Fix round 1 (I2): once the examiner has closed (here by an early Finish whose grading failed), no more turns.
  it('refuses turns after an early Finish whose grading failed, and the retry adds no second closing line', async () => {
    let fail = true;
    const { practice, spoken, say } = setup({ turns: 4, replies: [{ speaker: 'partner', text: 'Ja.' }, { speaker: 'partner', text: 'Nein.' }], grade: () => (fail ? { ok: false, error: 'down', code: 'ai_failed' } : { ok: true, text: GRADE }) });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo'));
    await expect(spoken.finish(run.attemptId)).rejects.toMatchObject({ kind: 'ai_failed' });
    await expect(spoken.turn(run.attemptId, await say(run.attemptId, 'Noch was'))).rejects.toMatchObject({ kind: 'bad_request' });
    fail = false;
    const result = await spoken.finish(run.attemptId);
    expect(result.spoken!.turns.map((t) => t.speaker)).toEqual(['examiner', 'student', 'partner', 'examiner']);
  });

  // Fix round 1 (I3): the slow closing render happens before the lock, so render plus grading can't outlast the
  // lock's 120 s and let a second Finish grade (and log the marks) again.
  it('grades once when the closing render and the grading together take longer than the lock', async () => {
    let releaseGrade: (r: AiResult) => void = () => {};
    const { db, practice, spoken, generate, say, provider, row, advance } = setup({ turns: 4, replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'ich gehe gestern einkaufen'));
    // The closing line takes 100 s to render, then grading hangs.
    vi.mocked(provider.render).mockImplementation(async () => {
      advance(100);
      return Buffer.from('OggS-slow');
    });
    generate.mockImplementationOnce(() => new Promise<AiResult>((resolve) => (releaseGrade = resolve)));
    const first = spoken.finish(run.attemptId);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(row(run.attemptId).grading_started_at).toEqual(expect.any(String));
    advance(30);
    await expect(spoken.finish(run.attemptId)).rejects.toMatchObject({ code: 'spoken_grading' });
    releaseGrade({ ok: true, text: GRADE });
    expect(await first).toMatchObject({ score: 15 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM error_log').get()).toEqual({ n: 1 });
  });

  // Fix round 1 (I3): two Finishes that both render a closing line keep only the lock winner's.
  it('keeps one closing line when two Finishes render at once', async () => {
    const { db, practice, spoken, say } = setup({ turns: 4, replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'ich gehe gestern einkaufen'));
    const outcomes = await Promise.allSettled([spoken.finish(run.attemptId), spoken.finish(run.attemptId)]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM error_log').get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM speech_clips WHERE role = 'examiner'").get()).toEqual({ n: 2 });
  });

  // Fix round 1 (Minor 2): a turn that loses its write to a Finish's grading lock is told so.
  it('answers spoken_grading when a turn loses its write to a Finish', async () => {
    let releaseTurn: (r: AiResult) => void = () => {};
    let releaseGrade: (r: AiResult) => void = () => {};
    const { practice, spoken, generate, say, row } = setup({ turns: 4, replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo'));
    const clip = await say(run.attemptId, 'Noch was');
    generate.mockImplementationOnce(() => new Promise<AiResult>((resolve) => (releaseTurn = resolve)));
    const turn = spoken.turn(run.attemptId, clip);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    generate.mockImplementationOnce(() => new Promise<AiResult>((resolve) => (releaseGrade = resolve)));
    const finish = spoken.finish(run.attemptId);
    await vi.waitFor(() => expect(row(run.attemptId).grading_started_at).toEqual(expect.any(String)));
    releaseTurn({ ok: true, text: JSON.stringify({ speaker: 'partner', text: 'Zu spät.' }) });
    await expect(turn).rejects.toMatchObject({ code: 'spoken_grading' });
    releaseGrade({ ok: true, text: GRADE });
    expect((await finish).spoken!.turns.some((t) => t.text === 'Zu spät.')).toBe(false);
  });

  it('leaves the attempt open and unlocked when grading fails, and grades on a retry', async () => {
    let fail = true;
    const { practice, spoken, say, row } = setup({ replies: [{ speaker: 'partner', text: 'Ja.' }], grade: () => (fail ? { ok: false, error: 'down', code: 'ai_failed' } : { ok: true, text: GRADE }) });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo Jonas'));
    await expect(spoken.finish(run.attemptId)).rejects.toMatchObject({ kind: 'ai_failed', code: 'ai_failed' });
    expect(row(run.attemptId)).toMatchObject({ finished_at: null, grading_started_at: null, result: null });
    fail = false;
    expect(await spoken.finish(run.attemptId)).toMatchObject({ score: 15 });
  });

  // S19: Finish before the last turn stores the examiner's closing line, then grades.
  it('closes the conversation on an early Finish and refuses further turns', async () => {
    const { practice, spoken, generate, say } = setup({ turns: 4, replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo Jonas'));
    const result = await spoken.finish(run.attemptId);
    expect(result.spoken!.turns.map((t) => t.speaker)).toEqual(['examiner', 'student', 'partner', 'examiner']);
    expect(result.spoken!.turns.at(-1)!.text).toBe(CLOSING_LINE);
    expect(generate.mock.calls.at(-1)![0].messages[0].content).toContain(`Examiner: ${CLOSING_LINE}`);
    // The attempt is finished now, so its scope takes no more recordings and the turn route refuses.
    await expect(say(run.attemptId, 'Noch was')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spoken.turn(run.attemptId, result.spoken!.turns[1].clipId)).rejects.toMatchObject({ kind: 'bad_request' });
  });

  // B7: the grading lock.
  it('refuses a second finish with spoken_grading while the first is grading', async () => {
    let release: (r: AiResult) => void = () => {};
    const { practice, spoken, generate, say, row } = setup({ replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo Jonas'));
    generate.mockImplementationOnce(() => new Promise<AiResult>((resolve) => (release = resolve)));
    const first = spoken.finish(run.attemptId);
    await vi.waitFor(() => expect(row(run.attemptId).grading_started_at).toEqual(expect.any(String)));
    await expect(spoken.finish(run.attemptId)).rejects.toMatchObject({ kind: 'unavailable', code: 'spoken_grading' });
    // A turn is refused too while the conversation is being graded.
    await expect(spoken.turn(run.attemptId, 'x')).rejects.toMatchObject({ code: 'spoken_grading' });
    release({ ok: true, text: GRADE });
    expect(await first).toMatchObject({ score: 15 });
  });

  // B7: clip checks and the minimum of one student turn.
  it('refuses a reused, foreign or partner clip, an empty transcript, and a finish with no student turn', async () => {
    // The second start finds its one set seen and asks the AI for a pool set first ('fail': it gets the seen one).
    const { practice, spoken, say, clips } = setup({ turns: 4, replies: ['fail', { speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await expect(spoken.finish(run.attemptId)).rejects.toMatchObject({ kind: 'bad_request' });
    const other = await practice.start('telc-b1', 'sprechen-3');
    const foreign = await say(other.attemptId, 'Fremd');
    await expect(spoken.turn(run.attemptId, foreign)).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spoken.turn(run.attemptId, run.spoken!.turns[0].clipId)).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spoken.turn(run.attemptId, 'no-such-clip')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spoken.turn(run.attemptId, await say(run.attemptId, '', []))).rejects.toMatchObject({ kind: 'bad_request' });
    const mine = await say(run.attemptId, 'Hallo');
    await spoken.turn(run.attemptId, mine);
    await expect(spoken.turn(run.attemptId, mine)).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spoken.turn(9999, mine)).rejects.toMatchObject({ kind: 'not_found' });
    expect(clips.getClip(foreign)).not.toBeNull();
  });

  // B7: compare-and-set on answers. The losing turn's partner clip is deleted, and it gets the current turns.
  it('lets only one of two racing turns append', async () => {
    const { db, practice, spoken, generate, say, row } = setup({ turns: 4 });
    const run = await practice.start('telc-b1', 'sprechen-3');
    const a = await say(run.attemptId, 'Erster');
    const b = await say(run.attemptId, 'Zweiter');
    const releases: ((r: AiResult) => void)[] = [];
    generate.mockImplementation(() => new Promise<AiResult>((resolve) => releases.push(resolve)));
    const ta = spoken.turn(run.attemptId, a);
    const tb = spoken.turn(run.attemptId, b);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[0]({ ok: true, text: JSON.stringify({ speaker: 'partner', text: 'Antwort eins' }) });
    const won = await ta;
    releases[1]({ ok: true, text: JSON.stringify({ speaker: 'partner', text: 'Antwort zwei' }) });
    const lost = await tb;
    expect(won.turns.map((t) => t.text)).toEqual([expect.any(String), 'Erster', 'Antwort eins']);
    expect(lost.turns).toEqual(won.turns);
    expect(JSON.parse(row(run.attemptId).answers as string).clipIds).toHaveLength(3);
    // The loser's rendered reply is gone: only the intro and the winning reply remain as partner clips.
    expect(db.prepare("SELECT role, transcript FROM speech_clips WHERE role <> 'student' ORDER BY rowid").all()).toEqual([
      { role: 'examiner', transcript: expect.stringContaining(INTRO) },
      { role: 'partner', transcript: 'Antwort eins' },
    ]);
  });

  // B3: a failed text-to-speech keeps the text, without audio.
  it('stores a text-only clip when the voice cannot be rendered', async () => {
    const { practice, spoken, say, clips, clipsDir } = setup({ render: async () => Promise.reject(new Error('tts down')), replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    expect(run.spoken!.turns[0]).toMatchObject({ audio: false });
    expect(clips.getClip(run.spoken!.turns[0].clipId)).toMatchObject({ role: 'examiner', path: null });
    const turn = await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo'));
    expect(turn.turns.at(-1)).toMatchObject({ speaker: 'partner', text: 'Ja.', audio: false });
    expect(existsSync(clipsDir) ? readdirSync(clipsDir).filter((f) => f.endsWith('.ogg')) : []).toEqual([]);
  });

  it('keeps the student turn unsent when the partner AI fails, so the same clip can be sent again', async () => {
    const { practice, spoken, say, row } = setup({ turns: 4, replies: ['fail', { speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    const clip = await say(run.attemptId, 'Hallo');
    await expect(spoken.turn(run.attemptId, clip)).rejects.toMatchObject({ kind: 'ai_failed' });
    expect(JSON.parse(row(run.attemptId).answers as string).clipIds).toHaveLength(1);
    expect((await spoken.turn(run.attemptId, clip)).turns).toHaveLength(3);
  });

  // S10: no anchors → the rubric only, and one admin notice.
  it('grades with the rubric only and raises "Speaking anchors missing" when the part has no anchors', async () => {
    const { db, practice, spoken, generate, say } = setup({ anchors: null, replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    await spoken.turn(run.attemptId, await say(run.attemptId, 'Hallo'));
    expect(await spoken.finish(run.attemptId)).toMatchObject({ score: 15 });
    expect(generate.mock.calls.at(-1)![0].systemPrompt).not.toContain('Reference conversations');
    expect(db.prepare('SELECT kind, problem_key, title FROM admin_notifications').all()).toEqual([
      { kind: 'content_issues', problem_key: 'speaking_anchors:telc-b1/sprechen-3', title: 'Speaking anchors missing' },
    ]);
  });

  it('refuses turns and finish on an attempt open longer than 3 hours, and turns on a non-spoken attempt', async () => {
    const { practice, spoken, say, advance } = setup({ replies: [{ speaker: 'partner', text: 'Ja.' }] });
    const run = await practice.start('telc-b1', 'sprechen-3');
    const clip = await say(run.attemptId, 'Hallo');
    const reading = await practice.start('telc-b1', 'lesen-1');
    await expect(spoken.turn(reading.attemptId, clip)).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spoken.finish(reading.attemptId)).rejects.toMatchObject({ kind: 'bad_request' });
    advance(3 * 3600 + 1);
    await expect(spoken.turn(run.attemptId, clip)).rejects.toMatchObject({ kind: 'not_found' });
    await expect(spoken.finish(run.attemptId)).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('spoken parts in exam practice', () => {
  it('is runnable only while the speech service is up, and start refuses with speech_unavailable when it is down', async () => {
    const up = setup();
    const parts = (await up.practice.overview()).parts;
    expect(parts.find((p) => p.part.id === 'sprechen-3')).toMatchObject({ runnable: true, speechUnavailable: false });
    const down = setup({ speechUp: false });
    const downParts = (await down.practice.overview()).parts;
    expect(downParts.find((p) => p.part.id === 'sprechen-3')).toMatchObject({ runnable: false, speechUnavailable: true });
    expect(downParts.find((p) => p.part.id === 'lesen-1')).toMatchObject({ runnable: true, speechUnavailable: false });
    await expect(down.practice.start('telc-b1', 'sprechen-3')).rejects.toMatchObject({ kind: 'unavailable', code: 'speech_unavailable' });
  });

  // NEEDS_USER5: the overview says whether an AI provider is set up.
  it('reports whether an AI provider is set up', async () => {
    const { db, practice } = setup();
    expect((await practice.overview()).aiReady).toBe(false);
    db.prepare("INSERT INTO provider_connections (provider_type, label, is_active, created_at) VALUES ('ollama', 'Local', 1, '2026-10-22T10:00:00Z')").run();
    expect((await practice.overview()).aiReady).toBe(true);
  });

  it('a spoken attempt is never finished through the generic submit and has no items to ask about', async () => {
    const { practice } = setup();
    const run = await practice.start('telc-b1', 'sprechen-3');
    await expect(practice.submit(run.attemptId, { type: 'spoken', clipIds: [] })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  // B4: the oral block starts separately and keeps its own clock.
  it('offers the oral block with the written mock and starts it on demand with its own clock', async () => {
    const { db, practice, advance } = setup();
    const mock = await practice.startMock('telc-b1');
    expect(mock.minutes).toBe(150);
    expect(mock.runs.every((r) => r.part.skill !== 'speaking')).toBe(true);
    expect(mock.oral).toEqual({ partIds: ['sprechen-1', 'sprechen-2', 'sprechen-3'], runnable: true });

    // sprechen-1 and -2 have no fixture sets and the AI is offline, so the oral block can't start yet.
    await expect(practice.startMockOral('nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(practice.startMockOral(mock.mockId)).rejects.toMatchObject({ kind: 'unavailable' });

    // With a set for every oral part, the oral block starts once.
    const content = (db.prepare("SELECT content FROM teil_sets WHERE part_id = 'sprechen-3'").get() as { content: string }).content;
    for (const partId of ['sprechen-1', 'sprechen-2']) {
      db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, 'telc-b1', ?, 'starter', ?, '2026-10-22')").run(`fx-${partId}`, partId, content);
    }
    advance(160 * 60);
    const oral = await practice.startMockOral(mock.mockId);
    expect(oral.mockId).toBe(mock.mockId);
    expect(oral.runs.map((r) => r.part.id)).toEqual(['sprechen-1', 'sprechen-2', 'sprechen-3']);
    expect(oral.runs.every((r) => r.mockId === mock.mockId && r.spoken?.turns.length === 1)).toBe(true);
    await expect(practice.startMockOral(mock.mockId)).rejects.toMatchObject({ kind: 'unavailable' });

    // The written block's clock still counts only the written parts (150 min), the oral one only its 15.
    const written = await practice.submit(mock.runs[0].attemptId, { type: 'matching', selected: [-1, -1, -1, -1, -1] });
    expect(written.overtimeSeconds).toBe(10 * 60);
    const spoken = createSpokenPartService(db, { now: () => new Date(Date.parse(oral.runs[0].startedAt) + 16 * 60 * 1000), generate: aiFake([], () => ({ ok: true, text: GRADE })), provider: { health: async () => ({ ok: true, voices: [] }), render: async () => Buffer.from('x'), convert: async (d) => d, transcribe: async () => ({ text: 'Hallo Jonas', language: 'de', duration: 1, words: [] }) }, readAnchors: () => ANCHORS, clipsDir: join(dir, 'speech-tmp') });
    const clip = await createSpeechClipService(db, { provider: { health: async () => ({ ok: true, voices: [] }), render: async () => Buffer.alloc(0), convert: async (d) => d, transcribe: async () => ({ text: 'Hallo Jonas', language: 'de', duration: 1, words: [] }) }, dir: join(dir, 'speech-tmp') }).transcribeForScope(`teil:${oral.runs[2].attemptId}`, Buffer.from('rec'), 'audio/webm');
    db.prepare('UPDATE teil_attempts SET answers = ? WHERE id = ?').run(JSON.stringify({ type: 'spoken', clipIds: [oral.runs[2].spoken!.turns[0].clipId, clip.clipId] }), oral.runs[2].attemptId);
    expect((await spoken.finish(oral.runs[2].attemptId)).overtimeSeconds).toBe(60);
  });

  // Fix round 1 (Minor 1): two racing starts create the oral block once.
  it('creates the oral block once when two starts race', async () => {
    const { db, practice } = setup();
    const mock = await practice.startMock('telc-b1');
    const content = (db.prepare("SELECT content FROM teil_sets WHERE part_id = 'sprechen-3'").get() as { content: string }).content;
    for (const partId of ['sprechen-1', 'sprechen-2']) {
      db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, 'telc-b1', ?, 'starter', ?, '2026-10-22')").run(`fx-${partId}`, partId, content);
    }
    const [a, b] = await Promise.allSettled([practice.startMockOral(mock.mockId), practice.startMockOral(mock.mockId)]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(db.prepare("SELECT COUNT(*) AS n FROM teil_attempts WHERE mock_id = ? AND part_id LIKE 'sprechen-%'").get(mock.mockId)).toEqual({ n: 3 });
  });

  // Fix round 1 (Minor 1): a conversation that fails to open takes the whole block back out, so it can be retried.
  it('removes the oral block when one of its conversations fails to open, so a retry starts it', async () => {
    const { db, practice, provider, clipsDir } = setup();
    const mock = await practice.startMock('telc-b1');
    const content = (db.prepare("SELECT content FROM teil_sets WHERE part_id = 'sprechen-3'").get() as { content: string }).content;
    for (const partId of ['sprechen-1', 'sprechen-2']) {
      db.prepare("INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES (?, 'telc-b1', ?, 'starter', ?, '2026-10-22')").run(`fx-${partId}`, partId, content);
    }
    // The second intro can't be stored: its folder has become a file.
    let calls = 0;
    vi.mocked(provider.render).mockImplementation(async () => {
      if (++calls === 2) {
        rmSync(clipsDir, { recursive: true, force: true });
        writeFileSync(clipsDir, 'not a folder');
      }
      return Buffer.from('OggS-rendered');
    });
    await expect(practice.startMockOral(mock.mockId)).rejects.toThrow();
    expect(db.prepare("SELECT COUNT(*) AS n FROM teil_attempts WHERE mock_id = ? AND part_id LIKE 'sprechen-%'").get(mock.mockId)).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM speech_clips WHERE scope LIKE 'teil:%'").get()).toEqual({ n: 0 });
    rmSync(clipsDir, { force: true });
    expect((await practice.startMockOral(mock.mockId)).runs).toHaveLength(3);
  });

  it('refuses the oral block while the speech service is down', async () => {
    // Listening audio is cached, so the written mock runs with the speech service down.
    const { practice } = setup({ speechUp: false, cached: true });
    const mock = await practice.startMock('telc-b1');
    expect(mock.oral).toEqual({ partIds: ['sprechen-1', 'sprechen-2', 'sprechen-3'], runnable: false });
    await expect(practice.startMockOral(mock.mockId)).rejects.toMatchObject({ kind: 'unavailable', code: 'speech_unavailable' });
  });

  it('lists spoken parts in readiness', async () => {
    const { practice } = setup();
    expect(practice.readiness().parts.map((p) => p.partId)).toContain('sprechen-3');
  });
});
