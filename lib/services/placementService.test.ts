import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createPlacementService, PlacementError, toPlacementErrorResponse, type PlacementDeps } from './placementService';
import { createSpeechClipService } from './speechClipService';
import type { SpeechProvider } from '../speech/speechProvider';
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
  let state = await service.start();
  for (let i = 0; i < limit && state.status === 'in_progress'; i++) {
    const q = exam[i];
    state = await service.answer(q.id, i < rightCount ? rightAnswer(q) : wrongAnswer(q));
  }
  return state;
}

describe('placementService', () => {
  it('loads the bundled exam into an empty table and leaves an uploaded one alone', async () => {
    const db = createDbClient(':memory:');
    const service = createPlacementService(db, { gradeFreeText: vi.fn() });
    const file = join(mkdtempSync(join(tmpdir(), 'gait-exam-')), 'exam.json');
    writeFileSync(file, JSON.stringify({ questions: smallPlacementExam() }));

    service.syncBundledExam(file);
    expect(service.questionCount()).toBe(10);

    service.replaceExam(smallPlacementExam().slice(0, 3), { source: 'uploaded' });
    service.syncBundledExam(file);
    expect(service.questionCount()).toBe(3);
  });

  it('shows the first question without its answer', async () => {
    const { service } = setup();
    const state = await service.start();
    expect(state).toEqual({
      status: 'in_progress',
      question: { id: 'A1-mc', position: 1, total: 10, level: 'A1', type: 'multiple_choice', question: 'A1 question', options: ['right', 'wrong'] },
    });
  });

  it('refuses to start without an exam', async () => {
    const { service } = setup([]);
    await expect(service.start()).rejects.toBeInstanceOf(PlacementError);
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

  it('stores the question instruction on the answer record', async () => {
    const instruction = { en: 'Write a sentence.', de: 'Schreib einen Satz.' };
    const fill: PlacementQuestion = { id: 'fill', level: 'A1', type: 'fill_blank', content: { textWithBlank: 'Ich ___ gut.', correctAnswer: 'bin', instruction } };
    const { service } = setup([fill, ...smallPlacementExam()]);
    await service.start();
    await service.answer('fill', { type: 'fill_blank', text: 'bin' });
    const state = service.stop();
    expect(state.status === 'finished' && state.outcome.answers[0].instruction).toEqual(instruction);
  });

  it('reads legacy plain-text feedback from a stored session', async () => {
    const { db, service } = setup();
    await service.start();
    const legacy = [{ questionId: 'A1-mc', level: 'A1', type: 'multiple_choice', question: 'Q', given: 'a', correctAnswer: 'b', result: 'wrong', feedback: 'legacy' }];
    db.prepare('UPDATE placement_session SET answers = ? WHERE id = 1').run(JSON.stringify(legacy));
    const state = service.stop();
    expect(state.status === 'finished' && state.outcome.answers[0].feedback).toEqual({ en: 'legacy', de: 'legacy' });
  });

  it('rejects an answer to a question that is not the current one', async () => {
    const { service } = setup();
    await service.start();
    await expect(service.answer('B1-mc', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('rejects an answer of the wrong type', async () => {
    const { service } = setup();
    await service.start();
    await expect(service.answer('A1-mc', { type: 'fill_blank', text: 'x' })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('rejects answers when no test is in progress', async () => {
    const { service } = setup();
    await expect(service.answer('A1-mc', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ kind: 'no_session' });
    expect(() => service.stop()).toThrow(PlacementError);
  });

  it('grades free text with the AI, giving half points for almost', async () => {
    const gradeFreeText = vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: { en: 'x', de: 'y' } });
    const free: PlacementQuestion = { id: 'free', level: 'A2', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    await service.start();
    await service.answer('free', { type: 'free_text', text: 'Ich schreib.' });
    const state = service.stop();
    expect(gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Write.',
      modelAnswer: 'Ich schreibe.',
      studentAnswer: 'Ich schreib.',
      level: 'A2',
    });
    expect(state).toMatchObject({ outcome: { score: 1, answers: [{ result: 'almost', feedback: { en: 'x', de: 'y' } }] } });
  });

  it('keeps the test at the same question when free-text grading fails', async () => {
    const gradeFreeText = vi.fn().mockResolvedValue({ ok: false, error: 'Anthropic returned 429' });
    const free: PlacementQuestion = { id: 'free', level: 'A1', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    await service.start();
    await expect(service.answer('free', { type: 'free_text', text: 'x' })).rejects.toMatchObject({
      kind: 'grading_failed',
      message: 'Anthropic returned 429',
    });
    gradeFreeText.mockResolvedValue({ ok: true, result: 'correct', feedback: { en: 'Good.', de: 'Gut.' } });
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

  it('replacing the exam discards an attempt in progress', async () => {
    const { service } = setup();
    await service.start();
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

  it('keeps a higher placed level as the best result even when a bigger exam gives a higher raw score', async () => {
    // Reviewer example: 36/120 placed B2 (spoken items left out) against 37/135 placed B1 (spoken items served).
    const mc = (level: PlacementQuestion['level'], i: number): PlacementQuestion => ({
      id: `${level}-${i}`, level, type: 'multiple_choice', content: { question: `${level} ${i}`, options: ['right', 'wrong'], correctIndex: 0 },
    });
    const exam = (['A1', 'A2', 'B1', 'B2', 'C1'] as const).flatMap((level) => Array.from({ length: 9 }, (_, i) => mc(level, i)));
    const { db, service } = setup(exam);
    db.prepare(
      `INSERT INTO placement_best_result (id, score, max_score, placed_level, stop_reason, taken_at)
       VALUES (1, 36, 120, 'B2', 'beyond_my_knowledge', '2026-01-01 00:00:00')`
    ).run();
    // A1 all right (9), A2 eight right and one wrong (16), B1 four right (12): 37 of 135, placed B1.
    let state = await service.start();
    for (let i = 0; i < 22 && state.status === 'in_progress'; i++) {
      state = await service.answer(exam[i].id, i === 17 ? wrongAnswer(exam[i]) : rightAnswer(exam[i]));
    }
    expect(service.stop()).toMatchObject({ outcome: { score: 37, maxScore: 135, placedLevel: 'B1', isNewBest: false } });
    expect(service.getBestResult()).toMatchObject({ score: 36, maxScore: 120, placedLevel: 'B2' });
  });

  it('on the same placed level, the higher share of the maximum wins, not the higher raw score', async () => {
    const { db, service, exam } = setup();
    const best = (score: number, max: number) =>
      db.prepare(
        `INSERT INTO placement_best_result (id, score, max_score, placed_level, stop_reason, taken_at)
         VALUES (1, ?, ?, 'A2', 'beyond_my_knowledge', '2026-01-01 00:00:00')
         ON CONFLICT(id) DO UPDATE SET score = excluded.score, max_score = excluded.max_score, placed_level = 'A2'`
      ).run(score, max);
    // Three right (A1 mc, A1 fill, A2 mc): 4 of 30, placed A2, a share of 0.133.
    best(3, 10); // 0.3: a lower raw score but a higher share stays best.
    await answerInOrder(service, exam, 3, 3);
    expect(service.stop()).toMatchObject({ outcome: { score: 4, maxScore: 30, placedLevel: 'A2', isNewBest: false } });
    expect(service.getBestResult()).toMatchObject({ score: 3, maxScore: 10 });

    best(5, 40); // 0.125: the new 0.133 wins.
    await answerInOrder(service, exam, 3, 3);
    expect(service.stop()).toMatchObject({ outcome: { isNewBest: true } });
    expect(service.getBestResult()).toMatchObject({ score: 4, maxScore: 30, placedLevel: 'A2' });
  });

  it('accepts only one of two simultaneous answers to the same question', async () => {
    const gradeFreeText = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true as const, result: 'correct' as const, feedback: { en: 'Good.', de: 'Gut.' } };
    });
    const free: PlacementQuestion = { id: 'free', level: 'A1', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    await service.start();

    const answer = { type: 'free_text' as const, text: 'Ich schreibe.' };
    const results = await Promise.allSettled([service.answer('free', answer), service.answer('free', answer)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { kind: 'bad_request' } });
  });
});

describe('toPlacementErrorResponse', () => {
  it('maps each error kind to a status', async () => {
    expect(toPlacementErrorResponse(new PlacementError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x', code: 'ai_failed', params: { detail: 'x' } } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'no_session'))).toEqual({ status: 409, body: { error: 'x', code: 'no_session' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'no_exam'))).toEqual({ status: 409, body: { error: 'x', code: 'no_exam' } });
    expect(toPlacementErrorResponse(new Error('other'))).toBeNull();
  });

  describe('spoken items', () => {
    // A1: multiple choice, then a spoken item; one multiple choice for each higher level.
    // Full maximum 1 + 1 + 2 + 3 + 4 + 5 = 16; without the spoken item 15.
    const spoken: PlacementQuestion = { id: 'A1-spoken', level: 'A1', type: 'spoken', content: { prompt: 'Stellen Sie sich vor.', modelAnswer: 'Ich heiße Anna.' } };
    const mc = (level: PlacementQuestion['level']): PlacementQuestion => ({
      id: `${level}-mc`, level, type: 'multiple_choice', content: { question: `${level}?`, options: ['right', 'wrong'], correctIndex: 0 },
    });
    const spokenExam = [mc('A1'), spoken, mc('A2'), mc('B1'), mc('B2'), mc('C1')];
    const good = { type: 'multiple_choice' as const, selectedIndex: 0 };

    function spokenSetup(speechUp: () => Promise<boolean>) {
      const gradeFreeText = vi.fn().mockResolvedValue({ ok: true, result: 'correct', feedback: { en: 'Good.', de: 'Gut.' } });
      const db = createDbClient(':memory:');
      const clips = createSpeechClipService(db, { provider: { async transcribe() { return { text: 'Ich heiße Anna.', language: 'de', duration: 2, words: [] }; } } as unknown as SpeechProvider, dir: mkdtempSync(join(tmpdir(), 'gait-pl-clips-')) });
      const service = createPlacementService(db, { gradeFreeText, speechUp, getSpeechClip: clips.getClip, deleteSpeechScope: clips.deleteScope });
      service.replaceExam(spokenExam);
      return { db, service, clips, gradeFreeText };
    }
    const record = async (clips: ReturnType<typeof createSpeechClipService>, scope = 'placement') =>
      (await clips.transcribeForScope(scope, Buffer.from('OggS....'), 'audio/ogg')).clipId;

    it('leaves spoken items out when the speech service is down at start, even if it comes back', async () => {
      let up = false;
      const { service } = spokenSetup(async () => up);
      const first = await service.start();
      expect(first).toMatchObject({ status: 'in_progress', question: { id: 'A1-mc', total: 5 } });
      up = true;
      const second = await service.answer('A1-mc', good);
      expect(second).toMatchObject({ status: 'in_progress', question: { id: 'A2-mc', position: 2, total: 5 } });
      let state = second;
      for (const id of ['A2-mc', 'B1-mc', 'B2-mc', 'C1-mc']) state = await service.answer(id, good);
      expect(state).toMatchObject({ status: 'finished', outcome: { score: 15, maxScore: 15, placedLevel: 'C1', stopReason: 'finished' } });
      expect(service.getBestResult()).toMatchObject({ maxScore: 15 });
    });

    it('serves, takes a clip answer, and grades the transcript when the service is up', async () => {
      const { service, clips, gradeFreeText } = spokenSetup(async () => true);
      await service.start();
      const next = await service.answer('A1-mc', good);
      expect(next).toMatchObject({ status: 'in_progress', question: { id: 'A1-spoken', type: 'spoken', prompt: 'Stellen Sie sich vor.', total: 6 } });
      expect(JSON.stringify(next)).not.toContain('Ich heiße Anna');
      const clipId = await record(clips);
      let state = await service.answer('A1-spoken', { type: 'spoken', clipId });
      expect(gradeFreeText).toHaveBeenCalledWith({ prompt: 'Stellen Sie sich vor.', modelAnswer: 'Ich heiße Anna.', studentAnswer: 'Ich heiße Anna.', level: 'A1' });
      for (const id of ['A2-mc', 'B1-mc', 'B2-mc', 'C1-mc']) state = await service.answer(id, good);
      expect(state).toMatchObject({ status: 'finished', outcome: { score: 16, maxScore: 16 } });
      if (state.status === 'finished') expect(state.outcome.answers[1]).toMatchObject({ type: 'spoken', given: 'Ich heiße Anna.', correctAnswer: 'Ich heiße Anna.', result: 'correct' });
      // The scope is gone once the session ends.
      expect(clips.getClip(clipId)).toBeNull();
    });

    it('refuses a clip that is not the student\'s placement recording', async () => {
      const { service, clips } = spokenSetup(async () => true);
      await service.start();
      await service.answer('A1-mc', good);
      const foreign = await record(clips, 'freestyle:spoken');
      await expect(service.answer('A1-spoken', { type: 'spoken', clipId: foreign })).rejects.toMatchObject({ kind: 'bad_request' });
      await expect(service.answer('A1-spoken', { type: 'spoken', clipId: 'nope' })).rejects.toMatchObject({ kind: 'bad_request' });
    });

    it('lets a spoken item be skipped: 0 points, no mistake, still in the maximum', async () => {
      const { service } = spokenSetup(async () => true);
      await service.start();
      await service.answer('A1-mc', good);
      let state = await service.answer('A1-spoken', { type: 'spoken', skipped: true });
      for (const id of ['A2-mc', 'B1-mc', 'B2-mc', 'C1-mc']) state = await service.answer(id, good);
      expect(state).toMatchObject({ status: 'finished', outcome: { score: 15, maxScore: 16, stopReason: 'finished' } });
      if (state.status === 'finished') expect(state.outcome.answers[1]).toMatchObject({ type: 'spoken', given: '', result: 'wrong' });
    });

    it('refuses a skip on a question that is not spoken', async () => {
      const { service } = spokenSetup(async () => true);
      await service.start();
      await expect(service.answer('A1-mc', { type: 'spoken', skipped: true })).rejects.toMatchObject({ kind: 'bad_request' });
    });

    it('deletes the placement clips on Beyond my knowledge too', async () => {
      const { service, clips } = spokenSetup(async () => true);
      await service.start();
      await service.answer('A1-mc', good);
      const clipId = await record(clips);
      service.stop();
      expect(clips.getClip(clipId)).toBeNull();
    });

    it('treats a session with no stored served order as the whole exam', async () => {
      const { db, service } = spokenSetup(async () => false);
      await service.start();
      db.prepare("UPDATE placement_session SET served_ids = '[]'").run();
      expect(await service.answer('A1-mc', good)).toMatchObject({ question: { id: 'A1-spoken', total: 6 } });
    });
  });
});
