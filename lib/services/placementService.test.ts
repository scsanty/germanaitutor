import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createPlacementService, PlacementError, toPlacementErrorResponse, type PlacementDeps } from './placementService';
import type { PlacementQuestion } from '../tutoring/placementExamFormat';
import type { PlacementState } from '../tutoring/placementTypes';
import { smallPlacementExam, rightAnswer, wrongAnswer } from '@/test/placementFixtures';

function setup(exam: PlacementQuestion[] = smallPlacementExam(), deps?: PlacementDeps) {
  const db = createDbClient(':memory:');
  const service = createPlacementService(db, deps ?? { gradeFreeText: vi.fn() });
  service.replaceExam(exam);
  return { db, service, profiles: createProfileService(db), exam };
}

// Answers questions in order, right for the first `rightCount` and wrong after,
// until the test finishes or `limit` questions have been answered.
async function answerInOrder(
  service: ReturnType<typeof createPlacementService>,
  exam: PlacementQuestion[],
  rightCount: number,
  limit = exam.length
): Promise<PlacementState> {
  let state = service.start();
  for (let i = 0; i < limit && state.status === 'in_progress'; i++) {
    const q = exam[i];
    state = await service.answer(q.id, i < rightCount ? rightAnswer(q) : wrongAnswer(q));
  }
  return state;
}

describe('placementService', () => {
  it('loads the bundled exam only into an empty table', () => {
    const db = createDbClient(':memory:');
    const service = createPlacementService(db, { gradeFreeText: vi.fn() });
    const file = join(mkdtempSync(join(tmpdir(), 'gait-exam-')), 'exam.json');
    writeFileSync(file, JSON.stringify({ questions: smallPlacementExam() }));

    service.loadSeedExamIfEmpty(file);
    expect(service.questionCount()).toBe(10);

    service.replaceExam(smallPlacementExam().slice(0, 3));
    service.loadSeedExamIfEmpty(file);
    expect(service.questionCount()).toBe(3);
  });

  it('shows the first question without its answer', () => {
    const { service } = setup();
    const state = service.start();
    expect(state).toEqual({
      status: 'in_progress',
      question: { id: 'A1-mc', position: 1, total: 10, level: 'A1', type: 'multiple_choice', question: 'A1 question', options: ['right', 'wrong'] },
    });
  });

  it('refuses to start without an exam', () => {
    const { service } = setup([]);
    expect(() => service.start()).toThrow(PlacementError);
  });

  it('answering everything right finishes at C1 and sets the levels on a first placement', async () => {
    const { service, profiles, exam } = setup();
    const state = await answerInOrder(service, exam, exam.length);
    expect(state).toMatchObject({
      status: 'finished',
      outcome: { score: 30, maxScore: 30, placedLevel: 'C1', stopReason: 'finished', isNewBest: true },
    });
    expect(profiles.getProfile()).toMatchObject({
      highestUnlockedLevel: 'C1',
      activeLevel: 'C1',
      placementStatus: 'taken',
      unlockNoticeLevel: null,
    });
    expect(service.getBestResult()).toMatchObject({ score: 30, placedLevel: 'C1', stopReason: 'finished' });
  });

  it('stops automatically at the fifth wrong answer', async () => {
    const { service, exam } = setup();
    const state = await answerInOrder(service, exam, 0);
    expect(state).toMatchObject({ status: 'finished', outcome: { stopReason: 'five_mistakes', placedLevel: 'A1', score: 0 } });
    if (state.status === 'finished') expect(state.outcome.answers).toHaveLength(5);
  });

  it('stops with Beyond my knowledge and places from the score so far', async () => {
    const { service, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    expect(service.stop()).toMatchObject({
      status: 'finished',
      outcome: { score: 2, placedLevel: 'A2', stopReason: 'beyond_my_knowledge' },
    });
  });

  it('records each answer for the end screen', async () => {
    const { service, exam } = setup();
    await answerInOrder(service, exam, 1, 2);
    const state = service.stop();
    expect(state.status === 'finished' && state.outcome.answers).toEqual([
      { questionId: 'A1-mc', level: 'A1', type: 'multiple_choice', question: 'A1 question', given: 'right', correctAnswer: 'right', result: 'correct', feedback: null },
      { questionId: 'A1-fill', level: 'A1', type: 'fill_blank', question: 'A1 ___', given: 'definitely wrong', correctAnswer: 'ja', result: 'wrong', feedback: null },
    ]);
  });

  it('rejects an answer to a question that is not the current one', async () => {
    const { service } = setup();
    service.start();
    await expect(service.answer('B1-mc', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('rejects an answer of the wrong type', async () => {
    const { service } = setup();
    service.start();
    await expect(service.answer('A1-mc', { type: 'fill_blank', text: 'x' })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('rejects answers when no test is in progress', async () => {
    const { service } = setup();
    await expect(service.answer('A1-mc', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ kind: 'no_session' });
    expect(() => service.stop()).toThrow(PlacementError);
  });

  it('grades free text with the AI, giving half points for almost', async () => {
    const gradeFreeText = vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: 'Check the verb.' });
    const free: PlacementQuestion = { id: 'free', level: 'A2', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    service.start();
    await service.answer('free', { type: 'free_text', text: 'Ich schreib.' });
    const state = service.stop();
    expect(gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Write.',
      modelAnswer: 'Ich schreibe.',
      studentAnswer: 'Ich schreib.',
      level: 'A2',
      uiLanguage: 'en',
    });
    expect(state).toMatchObject({ outcome: { score: 1, answers: [{ result: 'almost', feedback: 'Check the verb.' }] } });
  });

  it('keeps the test at the same question when free-text grading fails', async () => {
    const gradeFreeText = vi.fn().mockResolvedValue({ ok: false, error: 'Anthropic returned 429' });
    const free: PlacementQuestion = { id: 'free', level: 'A1', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    service.start();
    await expect(service.answer('free', { type: 'free_text', text: 'x' })).rejects.toMatchObject({
      kind: 'grading_failed',
      message: 'Anthropic returned 429',
    });
    gradeFreeText.mockResolvedValue({ ok: true, result: 'correct', feedback: 'Good.' });
    const state = await service.answer('free', { type: 'free_text', text: 'x' });
    expect(state).toMatchObject({ status: 'in_progress', question: { position: 2 } });
  });

  it('a lower retake changes neither the levels nor the best result', async () => {
    const { service, profiles, exam } = setup();
    await answerInOrder(service, exam, exam.length);
    const state = await answerInOrder(service, exam, 0);
    expect(state).toMatchObject({ outcome: { placedLevel: 'A1', isNewBest: false } });
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'C1', activeLevel: 'C1' });
    expect(service.getBestResult()).toMatchObject({ placedLevel: 'C1', score: 30 });
  });

  it('a higher retake raises the unlock and sets the notice, keeping the active level', async () => {
    const { service, profiles, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    service.stop();
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'A2', activeLevel: 'A2' });

    await answerInOrder(service, exam, exam.length);
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'C1', activeLevel: 'A2', unlockNoticeLevel: 'C1' });
    expect(service.getBestResult()).toMatchObject({ placedLevel: 'C1' });
  });

  it('a first placement never lowers levels already unlocked, but sets the active level to the placed one', async () => {
    const { service, profiles, exam } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'B1', placementStatus: 'skipped' });
    const state = await answerInOrder(service, exam, 0);
    expect(state).toMatchObject({ outcome: { placedLevel: 'A1' } });
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'B1', activeLevel: 'A1', placementStatus: 'taken' });
  });

  it('a first placement clears an unlock notice left from before', async () => {
    const { service, profiles, exam } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'A2', placementStatus: 'skipped', unlockNoticeLevel: 'A2' });
    await answerInOrder(service, exam, exam.length);
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'C1', activeLevel: 'C1', unlockNoticeLevel: null, placementStatus: 'taken' });
  });

  it('skipping marks a pending placement as skipped but never undoes a taken one', async () => {
    const { service, profiles, exam } = setup();
    expect(service.skip().placementStatus).toBe('skipped');
    profiles.writeLevelState({ placementStatus: 'pending' });
    await answerInOrder(service, exam, 0);
    expect(service.skip().placementStatus).toBe('taken');
  });

  it('replacing the exam discards an attempt in progress', () => {
    const { service } = setup();
    service.start();
    service.replaceExam(smallPlacementExam());
    expect(() => service.stop()).toThrow(PlacementError);
  });

  it('offers the newly unlocked level after a higher retake, and nothing otherwise', async () => {
    const { service, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    const first = service.stop();
    expect(first.status === 'finished' && first.outcome.unlockOffer).toBeNull();

    const higher = await answerInOrder(service, exam, exam.length);
    expect(higher).toMatchObject({ outcome: { placedLevel: 'C1', unlockOffer: 'C1' } });

    const lower = await answerInOrder(service, exam, 0);
    expect(lower).toMatchObject({ outcome: { unlockOffer: null } });
  });

  it('a retake with the same score keeps the earlier best result', async () => {
    const { db, service, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    service.stop();
    db.prepare("UPDATE placement_best_result SET taken_at = '2026-01-01 00:00:00'").run();

    await answerInOrder(service, exam, 2, 2);
    expect(service.stop()).toMatchObject({ outcome: { isNewBest: false } });
    expect(service.getBestResult()).toMatchObject({ score: 2, takenAt: '2026-01-01 00:00:00' });
  });

  it('accepts only one of two simultaneous answers to the same question', async () => {
    const gradeFreeText = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true as const, result: 'correct' as const, feedback: 'Gut.' };
    });
    const free: PlacementQuestion = { id: 'free', level: 'A1', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    service.start();

    const answer = { type: 'free_text' as const, text: 'Ich schreibe.' };
    const results = await Promise.allSettled([service.answer('free', answer), service.answer('free', answer)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { kind: 'bad_request' } });
  });
});

describe('toPlacementErrorResponse', () => {
  it('maps each error kind to a status', () => {
    expect(toPlacementErrorResponse(new PlacementError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'no_session'))).toEqual({ status: 409, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'no_exam'))).toEqual({ status: 409, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new Error('other'))).toBeNull();
  });
});
