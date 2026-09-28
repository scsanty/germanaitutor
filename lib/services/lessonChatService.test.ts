import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createAttemptService } from './attemptService';
import { ChatError, createLessonChatService, toChatErrorResponse } from './lessonChatService';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup(generate = vi.fn().mockResolvedValue({ ok: true, text: 'Weil man so grüßt.' })) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  const chat = createLessonChatService(db, { generate, now: () => new Date('2026-09-24T10:00:00.000Z') });
  const attempts = createAttemptService(db, { now: () => new Date(2026, 8, 24, 10) });
  return { db, chat, generate, attempts };
}

describe('lessonChatService', () => {
  it('starts with an empty thread and reports whether the AI is available', () => {
    expect(setup().chat.getThread('a1-greet')).toEqual({ messages: [], aiAvailable: false });
  });

  it('stores a general question and its reply', async () => {
    const { chat, generate } = setup();
    const { messages } = await chat.send('a1-greet', '  Was heißt Hallo?  ', null);
    expect(messages).toEqual([
      { id: 1, role: 'user', content: 'Was heißt Hallo?', exerciseId: null, createdAt: '2026-09-24T10:00:00.000Z' },
      { id: 2, role: 'assistant', content: 'Weil man so grüßt.', exerciseId: null, createdAt: '2026-09-24T10:00:00.000Z' },
    ]);
    expect(chat.getThread('a1-greet').messages).toEqual(messages);
    const request = generate.mock.calls[0][0];
    expect(request.systemPrompt).toContain('"Saying hello"');
    expect(request.messages).toEqual([{ role: 'user', content: 'Was heißt Hallo?' }]);
  });

  it('attaches an answered exercise as context and tags the messages with it', async () => {
    const { chat, generate, attempts } = setup();
    await attempts.recordAttempt('a1-greet__ex1', { type: 'multiple_choice', selectedIndex: 1 }, 'lesson');
    const { messages } = await chat.send('a1-greet', 'Warum nicht Tschüss?', 'a1-greet__ex1');
    expect(messages.map((m) => m.exerciseId)).toEqual(['a1-greet__ex1', 'a1-greet__ex1']);
    const prompt: string = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain("Learner's answer: Tschüss");
    expect(prompt).toContain('Grade: wrong');
    expect(prompt).toContain('Correct answer: Hallo');
  });

  it('refuses an unanswered exercise, a flashcard, an exercise of another lesson, and an empty message', async () => {
    const { chat, attempts } = setup();
    await attempts.recordAttempt('a1-greet__ex2', { type: 'flashcard', rating: 'knew' }, 'lesson');
    await expect(chat.send('a1-greet', 'Warum?', 'a1-greet__ex1')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', 'Warum?', 'a1-greet__ex2')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', 'Warum?', 'a1-sein__ex2')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', '   ', null)).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('stores nothing when the AI fails', async () => {
    const { chat } = setup(vi.fn().mockResolvedValue({ ok: false, error: 'Anthropic returned 429' }));
    await expect(chat.send('a1-greet', 'Hallo?', null)).rejects.toMatchObject({
      kind: 'ai_failed',
      message: 'Anthropic returned 429',
    });
    expect(chat.getThread('a1-greet').messages).toEqual([]);
  });

  it('sends at most the last 20 messages, starting with a learner message', async () => {
    const { db, chat, generate } = setup();
    const insert = db.prepare(
      `INSERT INTO lesson_chat_messages (lesson_id, role, content, created_at) VALUES ('a1-greet', ?, ?, '2026-09-23T10:00:00.000Z')`
    );
    for (let i = 0; i < 25; i++) insert.run(i % 2 === 0 ? 'assistant' : 'user', `old ${i}`);
    await chat.send('a1-greet', 'new', null);
    const sent = generate.mock.calls[0][0].messages;
    expect(sent).toHaveLength(19);
    expect(sent[0]).toEqual({ role: 'user', content: 'old 7' });
    expect(sent[18]).toEqual({ role: 'user', content: 'new' });
  });

  it('rejects an unknown or locked lesson', async () => {
    const { chat } = setup();
    expect(() => chat.getThread('nope')).toThrow(ChatError);
    expect(() => chat.getThread('a2-past')).toThrow('Level A2 is locked');
    await expect(chat.send('a2-past', 'Hallo?', null)).rejects.toMatchObject({ kind: 'locked' });
  });

  it('maps error kinds to HTTP statuses', () => {
    expect(toChatErrorResponse(new ChatError('x', 'not_found'))?.status).toBe(404);
    expect(toChatErrorResponse(new ChatError('x', 'locked'))?.status).toBe(403);
    expect(toChatErrorResponse(new ChatError('x', 'bad_request'))?.status).toBe(400);
    expect(toChatErrorResponse(new ChatError('x', 'ai_failed'))).toEqual({ status: 502, body: { error: 'x' } });
    expect(toChatErrorResponse(new Error('x'))).toBeNull();
  });
});
