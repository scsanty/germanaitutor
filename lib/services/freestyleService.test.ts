import { describe, it, expect, vi } from 'vitest';
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

  it('refuses a locked level, an invalid level, and an unknown or disabled mode', async () => {
    const { service } = setup([]);
    const locked = service.start('conversation', { level: 'C1', setup: {} });
    await expect(locked).rejects.toBeInstanceOf(FreestyleError);
    await expect(locked).rejects.toMatchObject({ kind: 'locked', code: 'level_locked' });
    await expect(service.start('conversation', { level: 'Z9' as never, setup: {} })).rejects.toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    await expect(service.start('spoken', { level: 'B1', setup: {} })).rejects.toMatchObject({ kind: 'not_found' });
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
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'freestyle_%' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['lesson_attempts', 'lesson_completions', 'exercise_srs_state']));
    const before = tables.map(count);
    await service.start('conversation', { level: 'B1', setup: {} });
    await service.turn('conversation', 'Hallo');
    await service.end('conversation', {});
    expect(tables.map(count)).toEqual(before);
  });
});
