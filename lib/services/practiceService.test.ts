import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createPracticeService, PracticeError, toPracticeErrorResponse } from './practiceService';
import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function reply(exercises: unknown[]) {
  return { ok: true as const, text: JSON.stringify({ exercises }) };
}

const mc = (q: string) => ({ type: 'multiple_choice', content: { question: q, options: ['ja', 'nein'], correctIndex: 0 } });

function setup(generate = vi.fn().mockResolvedValue(reply([]))) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  markComplete(db, 'a1-greet');
  const gradeFreeText = vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: 'Fast.' });
  const service = createPracticeService(db, { generate, gradeFreeText, now: () => new Date('2026-09-29T10:00:00.000Z') });
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return { db, service, generate, gradeFreeText, count };
}

describe('practiceService.serveBatch', () => {
  it('refuses a lesson that is unknown, locked, or not completed by the student', async () => {
    const { service } = setup();
    await expect(service.serveBatch('nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.serveBatch('a2-past')).rejects.toMatchObject({ code: 'level_locked', params: { level: 'A2' } });
    await expect(service.serveBatch('a1-sein')).rejects.toMatchObject({ kind: 'not_completed', code: 'lesson_not_completed' });
  });

  it('serves unseen, non-rejected pool exercises first and marks them seen, without calling the AI', async () => {
    const { db, service, generate, count } = setup();
    for (let i = 1; i <= 6; i++) addPracticeExercise(db, `px-${i}`, 'a1-greet', { createdAt: `2026-09-29T10:00:0${i}.000Z` });
    db.prepare("UPDATE practice_exercises SET review_status = 'rejected' WHERE id = 'px-1'").run();
    const batch = await service.serveBatch('a1-greet');
    expect(batch.exercises.map((e) => e.id)).toEqual(['px-2', 'px-3', 'px-4', 'px-5', 'px-6']);
    expect(batch.exercises[0]).toEqual({ id: 'px-2', type: 'multiple_choice', question: 'Question px-2?', options: ['ja', 'nein'] });
    expect(count('SELECT COUNT(*) AS n FROM practice_seen')).toBe(5);
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates only what is missing, keeping valid, allowed, new exercises', async () => {
    const generate = vi.fn().mockResolvedValue(
      reply([
        { type: 'multiple_choice', content: { question: 'HOW do you greet someone?', options: ['Hallo', 'Tschüss'], correctIndex: 0 } },
        mc('Neu 1?'),
        { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } },
        { type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'x' } },
        { type: 'multiple_choice', content: { question: 'Bad', options: ['one'], correctIndex: 0 } },
        mc('Neu 2?'),
        mc('Neu 3?'),
      ])
    );
    const { db, service, count } = setup(generate);
    addPracticeExercise(db, 'px-1', 'a1-greet');
    addPracticeExercise(db, 'px-2', 'a1-greet');

    const batch = await service.serveBatch('a1-greet');
    // Review Focus 3: the AI returned more usable exercises than needed; only 3 are kept.
    expect(batch.exercises).toHaveLength(5);
    expect(batch.exercises.slice(0, 2).map((e) => e.id)).toEqual(['px-1', 'px-2']);
    expect(batch.exercises.slice(2).map((e) => (e.type === 'multiple_choice' ? e.question : e.type))).toEqual([
      'Neu 1?',
      'flashcard',
      'Neu 2?',
    ]);
    expect(count("SELECT COUNT(*) AS n FROM practice_exercises WHERE review_status = 'unreviewed'")).toBe(5);
    expect(count('SELECT COUNT(*) AS n FROM practice_seen')).toBe(5);
    const { systemPrompt } = generate.mock.calls[0][0];
    expect(systemPrompt).toContain('Write exactly 3 new exercises. Use only these types: multiple_choice, flashcard.');
  });

  it('never re-generates an exercise that already exists in the pool, even a rejected one', async () => {
    const generate = vi.fn().mockResolvedValue(reply([mc('Old?'), mc('Fresh?')]));
    const { db, service } = setup(generate);
    addPracticeExercise(db, 'px-old', 'a1-greet', { status: 'rejected', content: { question: 'Old?', options: ['ja', 'nein'], correctIndex: 0 } });
    const batch = await service.serveBatch('a1-greet');
    expect(batch.exercises.map((e) => (e.type === 'multiple_choice' ? e.question : ''))).toEqual(['Fresh?']);
  });

  it('serves a short batch when generation fails but the pool had something', async () => {
    const { db, service } = setup(vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' }));
    addPracticeExercise(db, 'px-1', 'a1-greet');
    expect((await service.serveBatch('a1-greet')).exercises.map((e) => e.id)).toEqual(['px-1']);
  });

  it('fails with the AI error when there is nothing at all to serve', async () => {
    const noProvider = setup(vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' }));
    await expect(noProvider.service.serveBatch('a1-greet')).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });

    const malformed = setup(vi.fn().mockResolvedValue({ ok: true, text: 'Sorry, no.' }));
    await expect(malformed.service.serveBatch('a1-greet')).rejects.toMatchObject({ code: 'ai_bad_reply' });

    const unusable = setup(vi.fn().mockResolvedValue(reply([{ type: 'free_text', content: { prompt: 'x', modelAnswer: 'y' } }])));
    await expect(unusable.service.serveBatch('a1-greet')).rejects.toMatchObject({ code: 'ai_no_exercises' });
  });

  it('serves no pool flashcards once the lesson is no longer vocabulary', async () => {
    const { db, service } = setup();
    addPracticeExercise(db, 'px-card', 'a1-greet', { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' }, createdAt: '2026-09-29T10:00:01.000Z' });
    addPracticeExercise(db, 'px-mc', 'a1-greet', { createdAt: '2026-09-29T10:00:02.000Z' });
    db.prepare("UPDATE lessons SET skill = 'grammar' WHERE id = 'a1-greet'").run();
    expect((await service.serveBatch('a1-greet')).exercises.map((e) => e.id)).toEqual(['px-mc']);
  });

  it('serves pool flashcards for a vocabulary lesson', async () => {
    const { db, service } = setup();
    addPracticeExercise(db, 'px-card', 'a1-greet', { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } });
    expect((await service.serveBatch('a1-greet')).exercises.map((e) => e.id)).toEqual(['px-card']);
  });
});

describe('practiceService.gradeAnswer', () => {
  it('grades without recording anything', async () => {
    const { db, service, count } = setup();
    addPracticeExercise(db, 'px-mc', 'a1-greet');
    addPracticeExercise(db, 'px-card', 'a1-greet', { type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } });
    expect(await service.gradeAnswer('px-mc', { type: 'multiple_choice', selectedIndex: 1 })).toEqual({ result: 'wrong', correctAnswer: 'ja' });
    expect(await service.gradeAnswer('px-card', { type: 'flashcard', rating: 'knew' })).toEqual({ result: 'correct', correctAnswer: null });
    expect(count('SELECT COUNT(*) AS n FROM lesson_attempts')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM exercise_srs_state')).toBe(0);
  });

  it('grades free text with the AI and shows the model answer, without feedback', async () => {
    const { db, service, gradeFreeText } = setup();
    addPracticeExercise(db, 'px-free', 'a1-greet', { type: 'free_text', content: { prompt: 'Greet a friend.', modelAnswer: 'Hallo!' } });
    expect(await service.gradeAnswer('px-free', { type: 'free_text', text: 'Halo!' })).toEqual({ result: 'almost', correctAnswer: 'Hallo!' });
    expect(gradeFreeText).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Greet a friend.', modelAnswer: 'Hallo!', level: 'A1' }));
  });

  it('reports a missing exercise, a mismatched answer, and an AI failure', async () => {
    const { db, service, gradeFreeText } = setup();
    // Review Focus 2: an exercise promoted or deleted mid-batch is simply gone.
    await expect(service.gradeAnswer('px-gone', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ code: 'not_found' });
    addPracticeExercise(db, 'px-mc', 'a1-greet');
    await expect(service.gradeAnswer('px-mc', { type: 'fill_blank', text: 'ja' })).rejects.toMatchObject({ kind: 'bad_request' });
    addPracticeExercise(db, 'px-free', 'a1-greet', { type: 'free_text', content: { prompt: 'p', modelAnswer: 'm' } });
    gradeFreeText.mockResolvedValueOnce({ ok: false, error: 'Anthropic returned 429', code: 'ai_failed', params: { detail: 'Anthropic returned 429' } });
    await expect(service.gradeAnswer('px-free', { type: 'free_text', text: 'x' })).rejects.toMatchObject({
      kind: 'ai_failed',
      params: { detail: 'Anthropic returned 429' },
    });
  });
});

describe('toPracticeErrorResponse', () => {
  it('maps kinds to statuses and bodies with codes', () => {
    expect(toPracticeErrorResponse(new PracticeError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x', code: 'not_found' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x', code: 'level_locked' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'not_completed'))).toEqual({ status: 409, body: { error: 'x', code: 'lesson_not_completed' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'ai_failed', 'no_provider'))).toEqual({ status: 502, body: { error: 'x', code: 'no_provider' } });
    expect(toPracticeErrorResponse(new Error('x'))).toBeNull();
  });
});
