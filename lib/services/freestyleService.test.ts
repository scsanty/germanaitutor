import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSpeechClipService } from './speechClipService';
import type { SpeechProvider } from '../speech/speechProvider';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createFreestyleService, FreestyleError, MAX_SETUP_VALUE_LENGTH } from './freestyleService';
import type { AiRequest, AiResult } from './aiService';

function setup(replies: string[]) {
  const db = createDbClient(':memory:');
  createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
  const generate = vi.fn(async () => {
    const text = replies.shift();
    return text === undefined ? { ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const } : { ok: true as const, text };
  });
  return { db, generate, service: createFreestyleService(db, { generate, now: () => new Date('2026-09-29T10:00:00Z') }) };
}

const conversationReply = JSON.stringify({
  corrections: [{ wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', reason_en: 'gehen takes sein', reason_de: 'gehen mit sein' }],
  reply: 'Wohin bist du gegangen?',
});
const summaryReply = JSON.stringify({ wentWell: [{ en: 'Clear questions', de: 'Klare Fragen' }], mistakes: [], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }] });

describe('freestyleService', () => {
  it('starts a conversation with the scenario opener, resumes it, and stores corrections with the turn', async () => {
    const { service } = setup([conversationReply]);
    const started = await service.start('conversation', { level: 'B1', setup: { scenarioId: 'b1-doctor' } });
    expect(started.messages.map((m) => [m.role, m.content])).toEqual([['assistant', 'Praxis Dr. Weber, guten Tag. Was kann ich für Sie tun?']]);
    expect((await service.start('conversation', { level: 'A1', setup: {} })).level).toBe('B1'); // resumed, not restarted
    const added = await service.turn('conversation', 'Ich habe gegangen zum Arzt.');
    expect(added.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(added[0].extra).toMatchObject({ corrections: [{ right: 'Ich bin gegangen' }] });
    expect(added[1].content).toBe('Wohin bist du gegangen?');
  });

  it('logs corrections to the error log with the right source, asks writing for 8192 tokens, and logs resubmissions again', async () => {
    const writingReply = JSON.stringify({
      corrections: [{ wrong: 'habe', right: 'bin', category: 'perfect_auxiliary', reason_en: 'sein', reason_de: 'sein' }],
      corrected: 'Ich bin gefahren.',
      comment_en: 'Good.',
      comment_de: 'Gut.',
    });
    const { db, generate, service } = setup([conversationReply, writingReply, writingReply]);
    const log = () => db.prepare('SELECT source, category, wrong, "right" AS r FROM error_log ORDER BY id').all();
    await service.start('conversation', { level: 'B1', setup: {} });
    await service.turn('conversation', 'Ich habe gegangen zum Arzt.');
    expect(log()).toEqual([{ source: 'freestyle_chat', category: 'other', wrong: 'Ich habe gegangen', r: 'Ich bin gegangen' }]);
    await service.start('free_writing', { level: 'B1', setup: {} });
    await service.turn('free_writing', 'Ich habe gefahren.');
    await service.turn('free_writing', 'Ich habe gefahren.');
    expect(log().slice(1)).toEqual(Array(2).fill({ source: 'freestyle_writing', category: 'perfect_auxiliary', wrong: 'habe', r: 'bin' }));
    const calls = generate.mock.calls as unknown as [AiRequest][];
    expect(calls[1][0].maxTokens).toBe(8192);
  });

  it('still resolves with the saved messages when the error-log write fails', async () => {
    const writingReply = JSON.stringify({ corrections: [{ wrong: 'habe', right: 'bin', reason_en: 's', reason_de: 's' }], corrected: 'Ich bin gefahren.', comment_en: 'G', comment_de: 'G' });
    const { db, service } = setup([conversationReply, writingReply]);
    db.exec('DROP TABLE error_log');
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await service.start('conversation', { level: 'B1', setup: {} });
    expect((await service.turn('conversation', 'Ich habe gegangen zum Arzt.')).map((m) => m.role)).toEqual(['user', 'assistant']);
    await service.start('free_writing', { level: 'B1', setup: {} });
    expect((await service.turn('free_writing', 'Ich habe gefahren.')).map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(service.session('free_writing')!.messages).toHaveLength(2);
    quiet.mockRestore();
  });

  it('logs nothing when a free-writing turn gets a bad reply', async () => {
    const { db, service } = setup(['not json']);
    await service.start('free_writing', { level: 'B1', setup: {} });
    await expect(service.turn('free_writing', 'Ich habe gefahren.')).rejects.toMatchObject({ code: 'ai_bad_reply' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM error_log').get() as { n: number }).n).toBe(0);
  });

  it('logs nothing when the turn fails', async () => {
    const { db, service } = setup(['not json']);
    await service.start('conversation', { level: 'B1', setup: {} });
    await expect(service.turn('conversation', 'Hallo')).rejects.toBeDefined();
    expect((db.prepare('SELECT COUNT(*) AS n FROM error_log').get() as { n: number }).n).toBe(0);
  });

  it('refuses a locked level, an invalid level, and an unknown or disabled mode', async () => {
    const { service } = setup([]);
    const locked = service.start('conversation', { level: 'C1', setup: {} });
    await expect(locked).rejects.toBeInstanceOf(FreestyleError);
    await expect(locked).rejects.toMatchObject({ kind: 'locked', code: 'level_locked' });
    await expect(service.start('conversation', { level: 'Z9' as never, setup: {} })).rejects.toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    await expect(service.start('exam_practice' as never, { level: 'B1', setup: { x: 'y' } })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('refuses sessions for exam practice, which has its own screen (S12)', async () => {
    const { service, generate } = setup([]);
    await expect(service.start('exam_practice', { level: 'B1', setup: {} })).rejects.toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    await expect(service.turn('exam_practice', 'Hallo')).rejects.toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    await expect(service.end('exam_practice', {})).rejects.toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    expect(service.overview().modes.find((m) => m.mode === 'exam_practice')).toEqual({ mode: 'exam_practice', enabled: true, open: false });
    expect(generate).not.toHaveBeenCalled();
  });

  it('starts a grammar drill with a first question and judges answers', async () => {
    const { service } = setup([
      '{"verdict":null,"explanation_en":null,"explanation_de":null,"next":"Bilde das Perfekt: ich gehe."}',
      '{"verdict":"correct","explanation_en":"Right: gehen uses sein.","explanation_de":"Richtig: gehen mit sein.","next":"Und: ich esse?"}',
    ]);
    const started = await service.start('grammar_drill', { level: 'B1', setup: { topic: 'Perfekt' } });
    expect(started.messages[0].content).toBe('Bilde das Perfekt: ich gehe.');
    const [, answer] = await service.turn('grammar_drill', 'ich bin gegangen');
    expect(answer.extra).toMatchObject({ verdict: 'correct', explanation: { en: 'Right: gehen uses sein.' } });
    expect(answer.content).toBe('Und: ich esse?');
  });

  it('generates a reading article at start and on request', async () => {
    const article = (t: string) =>
      JSON.stringify({ title: t, text: 'Text.', questions: [1, 2, 3].map((n) => ({ question: `F${n}?`, options: ['a', 'b', 'c'], correctIndex: 0 })) });
    const { service } = setup([article('Eins'), article('Zwei')]);
    expect((await service.start('free_reading', { level: 'B1', setup: { topic: 'Sport' } })).setup).toMatchObject({ article: { title: 'Eins' } });
    expect((await service.newArticle()).setup).toMatchObject({ article: { title: 'Zwei' } });
  });

  it('ends with a summary and deletes everything, or ends without one', async () => {
    const { db, service } = setup([conversationReply, summaryReply]);
    await service.start('conversation', { level: 'B1', setup: {} });
    await service.turn('conversation', 'Hallo');
    expect(await service.end('conversation', {})).toEqual({
      wentWell: [{ en: 'Clear questions', de: 'Klare Fragen' }],
      mistakes: [],
      words: [{ lemma: 'der Termin', meaningEn: 'appointment' }],
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_sessions').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_messages').get()).toEqual({ n: 0 });

    await service.start('conversation', { level: 'B1', setup: {} });
    expect(await service.end('conversation', { skipSummary: true })).toBeNull();
    expect(service.session('conversation')).toBeNull();
  });

  it('keeps the session when the summary fails, so the student can retry', async () => {
    const replies: string[] = [];
    const { db, service } = setup(replies);
    await service.start('free_writing', { level: 'B1', setup: {} });
    await expect(service.end('free_writing', {})).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });
    expect(service.session('free_writing')).not.toBeNull();
    replies.push(summaryReply);
    expect(await service.end('free_writing', {})).toMatchObject({ words: [{ lemma: 'der Termin' }] });
    expect(service.session('free_writing')).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_sessions').get()).toEqual({ n: 0 });
  });

  it('sends the AI a history that starts with a learner turn and keeps the opener', async () => {
    const { service, generate } = setup([conversationReply]);
    await service.start('conversation', { level: 'B1', setup: { scenarioId: 'b1-doctor' } });
    await service.turn('conversation', 'Ich brauche einen Termin.');
    const messages = (generate.mock.calls[0] as unknown as [AiRequest])[0].messages;
    expect(messages[0].role).toBe('user');
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Praxis Dr. Weber, guten Tag. Was kann ich für Sie tun?' });
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Ich brauche einen Termin.' });
  });

  it('starts a drill turn’s history with a learner turn', async () => {
    const { service, generate } = setup([
      '{"verdict":null,"explanation_en":null,"explanation_de":null,"next":"Bilde das Perfekt: ich gehe."}',
      '{"verdict":"correct","explanation_en":"Right.","explanation_de":"Richtig.","next":"Und: ich esse?"}',
    ]);
    await service.start('grammar_drill', { level: 'B1', setup: { topic: 'Perfekt' } });
    await service.turn('grammar_drill', 'ich bin gegangen');
    const messages = (generate.mock.calls[1] as unknown as [AiRequest])[0].messages;
    expect(messages[0].role).toBe('user');
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Bilde das Perfekt: ich gehe.' });
  });

  it('keeps a learner turn first when a long thread is trimmed', async () => {
    const { service, generate } = setup(Array.from({ length: 12 }, () => conversationReply));
    await service.start('conversation', { level: 'B1', setup: { scenarioId: 'b1-doctor' } });
    for (let i = 0; i < 12; i++) await service.turn('conversation', `Satz ${i}`);
    for (const call of generate.mock.calls as unknown as [AiRequest][]) {
      expect(call[0].messages[0].role).toBe('user');
      expect(call[0].messages.length).toBeLessThanOrEqual(21);
    }
  });

  it('validates setup per mode', async () => {
    const { service } = setup([]);
    const bad = (mode: 'conversation' | 'grammar_drill' | 'free_reading' | 'free_writing', s: Record<string, unknown>) =>
      expect(service.start(mode, { level: 'B1', setup: s })).rejects.toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    await bad('conversation', { mood: 'happy' });
    await bad('conversation', { topic: 'x'.repeat(MAX_SETUP_VALUE_LENGTH + 1) });
    await bad('conversation', { topic: 5 });
    await bad('conversation', { scenarioId: 'nope' });
    await bad('conversation', { scenarioId: 'a1-cafe' }); // an A1 scenario in a B1 session
    await bad('free_writing', { topic: 'Sport' });
    await bad('free_reading', { topic: 'Sport', article: { title: 'x' } });
    await bad('grammar_drill', {});
    await bad('free_reading', { topic: '  ' });
    expect(service.session('conversation')).toBeNull();
  });

  it('includes the article in a reading summary’s transcript', async () => {
    const article = JSON.stringify({
      title: 'Der Marathon',
      text: 'Viele Menschen laufen in Berlin.',
      questions: [1, 2, 3].map((n) => ({ question: `F${n}?`, options: ['a', 'b'], correctIndex: 0 })),
    });
    const { service, generate } = setup([article, summaryReply]);
    await service.start('free_reading', { level: 'B1', setup: { topic: 'Sport' } });
    await service.end('free_reading', {});
    const transcript = (generate.mock.calls[1] as unknown as [AiRequest])[0].messages[0].content;
    expect(transcript).toContain('Der Marathon');
    expect(transcript).toContain('Viele Menschen laufen in Berlin.');
  });

  it('does not write a turn into a session that started ending while the AI answered', async () => {
    const db = createDbClient(':memory:');
    const pending: ((result: AiResult) => void)[] = [];
    const generate = vi.fn((_request: AiRequest) => new Promise<AiResult>((resolve) => pending.push(resolve)));
    const service = createFreestyleService(db, { generate });
    await service.start('free_writing', { level: 'A1', setup: {} });
    const turn = service.turn('free_writing', 'Ich bin müde.');
    const end = service.end('free_writing', {});
    pending[0]({ ok: true, text: JSON.stringify({ corrections: [], corrected: 'Ich bin müde.', comment_en: 'Good.', comment_de: 'Gut.' }) });
    await expect(turn).rejects.toMatchObject({ kind: 'busy', code: 'session_ending' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_messages').get()).toEqual({ n: 0 });
    pending[1]({ ok: true, text: summaryReply });
    expect(await end).not.toBeNull();
  });

  it('refuses to start (resume) a session while its End is running, with busy / session_ending', async () => {
    const db = createDbClient(':memory:');
    const pending: ((result: AiResult) => void)[] = [];
    const generate = vi.fn((_request: AiRequest) => new Promise<AiResult>((resolve) => pending.push(resolve)));
    const service = createFreestyleService(db, { generate });
    await service.start('free_writing', { level: 'A1', setup: {} });
    const end = service.end('free_writing', {});
    await expect(service.start('free_writing', { level: 'A1', setup: {} })).rejects.toMatchObject({ kind: 'busy', code: 'session_ending' });
    pending[0]({ ok: true, text: summaryReply });
    expect(await end).not.toBeNull();
    expect((await service.start('free_writing', { level: 'A1', setup: {} })).messages).toEqual([]);
  });

  // Review Focus 1: a second End while one is running is refused, not doubled.
  it('refuses a second End while one is in progress', async () => {
    const { db, service, generate } = setup([summaryReply]);
    await service.start('free_writing', { level: 'B1', setup: {} });
    const first = service.end('free_writing', {});
    const second = service.end('free_writing', {});
    const skip = service.end('free_writing', { skipSummary: true });
    await expect(second).rejects.toMatchObject({ kind: 'busy', code: 'session_ending' });
    await expect(skip).rejects.toMatchObject({ kind: 'busy' });
    expect(await first).not.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_sessions').get()).toEqual({ n: 0 });
  });

  it('reports a malformed reply as ai_bad_reply and keeps the student’s text out of the thread', async () => {
    const { service } = setup(['not json']);
    await service.start('conversation', { level: 'B1', setup: {} });
    await expect(service.turn('conversation', 'Hallo')).rejects.toMatchObject({ code: 'ai_bad_reply' });
    expect(service.session('conversation')!.messages).toHaveLength(0);
  });

  it('writes nothing outside the freestyle tables', async () => {
    const { db, service } = setup([conversationReply, summaryReply]);
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'freestyle_%' AND name NOT LIKE 'sqlite_%' AND name <> 'error_log'").all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['lesson_attempts', 'lesson_completions', 'exercise_srs_state']));
    const before = tables.map(count);
    await service.start('conversation', { level: 'B1', setup: {} });
    await service.turn('conversation', 'Hallo');
    await service.end('conversation', {});
    expect(tables.map(count)).toEqual(before);
  });
});

describe('freestyleService: spoken conversation', () => {
  function spokenSetup(replies: string[], opts: { up?: boolean; render?: () => Promise<Buffer> } = {}) {
    const base = setup(replies);
    const dir = mkdtempSync(join(tmpdir(), 'gait-spoken-'));
    const render = vi.fn(opts.render ?? (async () => Buffer.from('ogg')));
    const provider = { render } as unknown as SpeechProvider;
    const clips = createSpeechClipService(base.db, { provider, dir });
    const service = createFreestyleService(base.db, {
      generate: base.generate,
      now: () => new Date('2026-09-29T10:00:00Z'),
      provider,
      clipsDir: dir,
      speechUp: async () => opts.up ?? true,
    });
    const studentClip = (transcript: string, scope = 'freestyle:spoken', role = 'student') => {
      const id = `clip-${Math.random().toString(36).slice(2)}`;
      writeFileSync(join(dir, `${id}.webm`), 'abc');
      base.db.prepare('INSERT INTO speech_clips (id, scope, role, file, transcript, words, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(id, scope, role, `${id}.webm`, transcript, '2026-09-29T10:00:00Z');
      return id;
    };
    return { ...base, service, render, clips, dir, studentClip };
  }

  it('starts a spoken session with the scenario opener, and needs the speech service', async () => {
    const { service } = spokenSetup([]);
    const started = await service.start('spoken', { level: 'B1', setup: { scenarioId: 'b1-doctor' } });
    expect(started.messages.map((m) => m.role)).toEqual(['assistant']);
    const down = spokenSetup([], { up: false });
    await expect(down.service.start('spoken', { level: 'B1', setup: {} })).rejects.toMatchObject({ code: 'speech_unavailable' });
    await expect(spokenSetup([]).service.start('spoken', { level: 'B1', setup: { prompt: 'x' } })).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(spokenSetup([]).service.start('spoken', { level: 'B1', setup: { scenarioId: 'a1-nope' } })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('stores the transcript with its corrections and the reply with a rendered clip, and logs to freestyle_chat', async () => {
    const { db, service, render, clips, studentClip } = spokenSetup([conversationReply]);
    await service.start('spoken', { level: 'B1', setup: {} });
    const clipId = studentClip('Ich habe gegangen zum Arzt.');
    const added = await service.turn('spoken', { clipId });
    expect(added.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(added[0].content).toBe('Ich habe gegangen zum Arzt.');
    expect(added[0].extra).toMatchObject({ clipId, corrections: [{ right: 'Ich bin gegangen' }] });
    expect(added[1].content).toBe('Wohin bist du gegangen?');
    expect(added[1].extra).toMatchObject({ audio: true });
    const replyClip = clips.getClip(added[1].extra!.clipId as string)!;
    expect(replyClip).toMatchObject({ scope: 'freestyle:spoken', role: 'partner', transcript: 'Wohin bist du gegangen?' });
    expect(existsSync(replyClip.path!)).toBe(true);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ segments: [{ text: 'Wohin bist du gegangen?', voice: 'ramona' }] }));
    expect(db.prepare('SELECT source, wrong FROM error_log').all()).toEqual([{ source: 'freestyle_chat', wrong: 'Ich habe gegangen' }]);
  });

  it('marks a reply whose clip the 6 h clean-up deleted as expired when the session is resumed', async () => {
    const { db, service, studentClip } = spokenSetup([conversationReply, conversationReply]);
    await service.start('spoken', { level: 'B1', setup: {} });
    const first = await service.turn('spoken', { clipId: studentClip('Hallo') });
    const second = await service.turn('spoken', { clipId: studentClip('Tschüss') });
    db.prepare('DELETE FROM speech_clips WHERE id = ?').run(first[1].extra!.clipId);
    const replies = service.session('spoken')!.messages.filter((m) => m.role === 'assistant' && m.extra);
    expect(replies.map((m) => m.extra)).toEqual([
      { clipId: first[1].extra!.clipId, audio: false, expired: true },
      { clipId: second[1].extra!.clipId, audio: true },
    ]);
  });

  it('keeps the reply as text when the voice render fails', async () => {
    const { db, service, studentClip } = spokenSetup([conversationReply], { render: async () => { throw new Error('tts down'); } });
    await service.start('spoken', { level: 'B1', setup: {} });
    const added = await service.turn('spoken', { clipId: studentClip('Hallo') });
    expect(added[1].extra).toMatchObject({ audio: false });
    expect(added[1].content).toBe('Wohin bist du gegangen?');
    expect(db.prepare('SELECT file FROM speech_clips WHERE id = ?').get(added[1].extra!.clipId)).toEqual({ file: null });
  });

  it('stores one pair when two requests send the same recording at once', async () => {
    const { service, studentClip } = spokenSetup([conversationReply, conversationReply]);
    await service.start('spoken', { level: 'B1', setup: {} });
    const clipId = studentClip('Hallo');
    const results = await Promise.allSettled([service.turn('spoken', { clipId }), service.turn('spoken', { clipId })]);
    expect(results.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(service.session('spoken')!.messages).toHaveLength(2);
  });

  it('refuses a missing, foreign-scope, partner or reused clip, and text input', async () => {
    const { service, studentClip } = spokenSetup([conversationReply, conversationReply]);
    await service.start('spoken', { level: 'B1', setup: {} });
    await expect(service.turn('spoken', { clipId: 'nope' })).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.turn('spoken', { clipId: studentClip('Hallo', 'lesson:x') })).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.turn('spoken', { clipId: studentClip('Hallo', 'freestyle:spoken', 'partner') })).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.turn('spoken', 'Hallo')).rejects.toMatchObject({ kind: 'bad_request' });
    const ok = studentClip('Hallo');
    await service.turn('spoken', { clipId: ok });
    await expect(service.turn('spoken', { clipId: ok })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('deletes the freestyle:spoken clips when the session ends, with or without a summary', async () => {
    const { db, service, studentClip, dir } = spokenSetup([conversationReply, summaryReply, conversationReply]);
    const files = () => readdirSync(dir);
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM speech_clips WHERE scope = 'freestyle:spoken'").get() as { n: number }).n;
    await service.start('spoken', { level: 'B1', setup: {} });
    await service.turn('spoken', { clipId: studentClip('Hallo') });
    expect(count()).toBe(2);
    expect(files()).toHaveLength(2); // the student's recording and the reply
    await service.end('spoken', {});
    expect(count()).toBe(0);
    expect(files()).toHaveLength(0);
    await service.start('spoken', { level: 'B1', setup: {} });
    await service.turn('spoken', { clipId: studentClip('Hallo') });
    await service.end('spoken', { skipSummary: true });
    expect(count()).toBe(0);
    expect(files()).toHaveLength(0);
  });
});
