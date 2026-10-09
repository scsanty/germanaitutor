import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createExamPracticeService, type ExamPracticeDeps } from './examPracticeService';
import type { AiRequest, AiResult } from './aiService';
import { createTeilSetService } from './teilSetService';

// B2: the service tests use one small fixture set per runnable written part, not the real content.
const SETS_DIR = join(process.cwd(), 'test', 'fixtures', 'teil-sets');
const failing = async (_request: AiRequest): Promise<AiResult> => ({ ok: false, error: 'offline' });

function setup(generate: ExamPracticeDeps['generate'] = failing) {
  const db = createDbClient(':memory:');
  createProfileService(db).updateProfile({ activeTrack: 'telc' });
  createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
  createTeilSetService(db, { setsDir: SETS_DIR }).loadBundled();
  let now = new Date('2026-09-29T10:00:00Z');
  const service = createExamPracticeService(db, { now: () => now, generate, setsDir: SETS_DIR });
  return { db, service, advance: (s: number) => (now = new Date(now.getTime() + s * 1000)) };
}

function allRight(db: ReturnType<typeof setup>['db'], setId: string) {
  const { content } = JSON.parse((db.prepare('SELECT content FROM teil_sets WHERE id = ?').get(setId) as { content: string }).content);
  return { type: 'matching', selected: content.answers };
}

describe('examPracticeService', () => {
  it('lists the active format’s parts; Sprachbausteine are mock-only (S10)', () => {
    const { service } = setup();
    const { format, parts } = service.overview();
    expect(format?.id).toBe('telc-b1');
    expect(parts.find((p) => p.part.id === 'lesen-1')).toMatchObject({ runnable: true, mockOnly: false, lastPercent: null });
    expect(parts.find((p) => p.part.id === 'hoeren-1')?.runnable).toBe(false);
    expect(parts.find((p) => p.part.id === 'sprachbausteine-1')).toMatchObject({ runnable: false, mockOnly: true });
  });

  it('scores a submitted Teil by points per item, marks overtime from the server clock, and is idempotent', async () => {
    const { db, service, advance } = setup();
    const run = await service.start('telc-b1', 'lesen-1');
    expect(run.minutes).toBe(20);
    expect(run.mockId).toBeNull();
    expect(JSON.stringify(run.set.view)).not.toContain('answers');
    advance(21 * 60);
    const result = service.submit(run.attemptId, allRight(db, run.set.id));
    expect(result).toMatchObject({ score: 25, maxScore: 25, overtimeSeconds: 60 });
    expect(result.review).toHaveLength(5);
    expect(result.review[0]).toMatchObject({ index: 0, right: true, correct: 'Überschrift a', answerText: 'Überschrift a', explanation: { en: expect.any(String), de: expect.any(String) } });
    expect(service.submit(run.attemptId, { type: 'matching', selected: [-1, -1, -1, -1, -1] })).toEqual(result); // Review Focus 1
    expect(service.overview().parts.find((p) => p.part.id === 'lesen-1')?.lastPercent).toBe(100);
  });

  it('gives partial points per right item', async () => {
    const { db, service } = setup();
    const run = await service.start('telc-b1', 'lesen-1');
    const right = allRight(db, run.set.id);
    const result = service.submit(run.attemptId, { ...right, selected: right.selected.map((s: number, i: number) => (i < 3 ? s : -1)) });
    expect(result).toMatchObject({ score: 15, maxScore: 25, overtimeSeconds: 0 });
    expect(result.review[4]).toMatchObject({ right: false, answerText: '' });
  });

  // Review Focus 2
  it('refuses a submit to an attempt abandoned more than 3 hours ago, or one that does not exist', async () => {
    const { db, service, advance } = setup();
    const run = await service.start('telc-b1', 'lesen-1');
    advance(3 * 3600 + 1);
    expect(() => service.submit(run.attemptId, allRight(db, run.set.id))).toThrow(expect.objectContaining({ kind: 'not_found' }));
    expect(() => service.submit(9999, allRight(db, run.set.id))).toThrow(expect.objectContaining({ kind: 'not_found' }));
  });

  it('refuses parts without a runner, mock-only parts, unknown parts and malformed answers', async () => {
    const { service } = setup();
    await expect(service.start('telc-b1', 'hoeren-1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
    await expect(service.start('telc-b1', 'sprachbausteine-1')).rejects.toMatchObject({ kind: 'unavailable', code: 'part_unavailable' });
    await expect(service.start('telc-b1', 'nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.start('../../x', 'lesen-1')).rejects.toMatchObject({ kind: 'not_found' });
    const run = await service.start('telc-b1', 'lesen-1');
    expect(() => service.submit(run.attemptId, { type: 'matching', selected: [0] })).toThrow(expect.objectContaining({ kind: 'bad_request' }));
    // I9: "none" is not an answer when the part has no "x" option.
    expect(() => service.submit(run.attemptId, { type: 'matching', selected: [null, 0, 0, 0, 0] })).toThrow(expect.objectContaining({ kind: 'bad_request' }));
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
      service.submit(run.attemptId, i === 0 ? { type: 'matching', selected: right.selected.map(() => -1) } : right);
    }
    const view = service.readiness();
    expect(view).toMatchObject({ formatId: 'telc-b1', formatName: expect.any(String) });
    expect(view.parts.find((p) => p.partId === 'lesen-1')).toMatchObject({ averagePercent: 100, attempts: 5, overtime: false });
    expect(view.parts.find((p) => p.partId === 'lesen-2')).toMatchObject({ averagePercent: null, attempts: 0, overtime: false });
    expect(view.parts.some((p) => p.partId === 'hoeren-1')).toBe(false);
  });

  it('runs a mock over every runnable written part with one shared timer (B2)', async () => {
    const { db, service, advance } = setup();
    const mock = await service.startMock('telc-b1');
    expect(mock.runs.map((r) => r.part.id)).toEqual(['lesen-1', 'lesen-2', 'lesen-3', 'sprachbausteine-1', 'sprachbausteine-2']);
    expect(mock.minutes).toBe(90);
    expect(new Set(mock.runs.map((r) => r.startedAt)).size).toBe(1);
    expect(mock.runs.every((r) => r.mockId === mock.mockId)).toBe(true);
    // Overtime runs against the mock's total time, not the part's own minutes.
    advance(30 * 60);
    expect(service.submit(mock.runs[0].attemptId, allRight(db, mock.runs[0].set.id)).overtimeSeconds).toBe(0);
    advance(61 * 60);
    expect(service.submit(mock.runs[2].attemptId, { type: 'matching', selected: Array(10).fill(-1) }).overtimeSeconds).toBe(60);
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
    service.submit(run.attemptId, allRight(db, run.set.id));
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
