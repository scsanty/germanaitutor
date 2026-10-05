import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createPlacementService } from './placementService';
import type { PlacementQuestion } from '../tutoring/placementExamFormat';
import { smallPlacementExam } from '@/test/placementFixtures';

function examFile(questions: PlacementQuestion[]): string {
  const file = join(mkdtempSync(join(tmpdir(), 'gait-exam-')), 'exam.json');
  writeFileSync(file, JSON.stringify({ questions }));
  return file;
}

// The bundled exam as a later release ships it: same ids, reworded first question.
function reworded(): PlacementQuestion[] {
  const exam = smallPlacementExam();
  const first = exam[0];
  if (first.type !== 'multiple_choice') throw new Error('fixture changed');
  exam[0] = { ...first, content: { ...first.content, question: 'Neue Frage' } };
  return exam;
}

function setup() {
  const db = createDbClient(':memory:');
  const service = createPlacementService(db, { gradeFreeText: vi.fn() });
  return { db, service };
}

const firstQuestion = (service: ReturnType<typeof setup>['service']) => (service.getExam()[0].content as { question: string }).question;

describe('syncBundledExam', () => {
  it('loads the bundled exam into a fresh DB and records it as bundled', () => {
    const { service } = setup();
    service.syncBundledExam(examFile(smallPlacementExam()));
    expect(service.questionCount()).toBe(10);
    expect(service.examSource()).toBe('bundled');
  });

  it('refreshes a bundled exam when the bundled file has changed', () => {
    const { service } = setup();
    service.syncBundledExam(examFile(smallPlacementExam()));
    service.syncBundledExam(examFile(reworded()));
    expect(firstQuestion(service)).toBe('Neue Frage');
  });

  it('never touches an exam an admin uploaded', () => {
    const { service } = setup();
    service.syncBundledExam(examFile(smallPlacementExam()));
    service.replaceExam(smallPlacementExam().slice(0, 3), { source: 'uploaded' });
    service.syncBundledExam(examFile(reworded()));
    expect(service.questionCount()).toBe(3);
    expect(firstQuestion(service)).toBe('A1 question');
    expect(service.examSource()).toBe('uploaded');
  });

  it('refreshes a legacy exam with no metadata whose ids all come from the bundled file', () => {
    const { db, service } = setup();
    service.replaceExam(smallPlacementExam());
    db.prepare('DELETE FROM placement_exam_meta').run();
    service.syncBundledExam(examFile(reworded()));
    expect(firstQuestion(service)).toBe('Neue Frage');
    expect(service.examSource()).toBe('bundled');
  });

  it('leaves a legacy exam with ids the bundled file does not have', () => {
    const { db, service } = setup();
    service.replaceExam([{ id: 'custom', level: 'A1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 } }]);
    db.prepare('DELETE FROM placement_exam_meta').run();
    service.syncBundledExam(examFile(reworded()));
    expect(service.getExam().map((q) => q.id)).toEqual(['custom']);
    expect(service.examSource()).toBe('uploaded');
  });

  it('is a no-op when the bundled content is unchanged, keeping an attempt in progress', () => {
    const { db, service } = setup();
    const file = examFile(smallPlacementExam());
    service.syncBundledExam(file);
    service.start();
    // A marker a reload would overwrite.
    db.prepare("UPDATE placement_questions SET content = json_set(content, '$.question', 'marker') WHERE position = 1").run();
    service.syncBundledExam(file);
    expect(firstQuestion(service)).toBe('marker');
    expect(() => service.stop()).not.toThrow();
  });

  it('keeps an attempt in progress across a refresh when the question order is unchanged', async () => {
    const { service } = setup();
    service.syncBundledExam(examFile(smallPlacementExam()));
    service.start();
    await service.answer('A1-mc', { type: 'multiple_choice', selectedIndex: 0 });
    service.syncBundledExam(examFile(reworded()));
    const state = await service.answer('A1-fill', { type: 'fill_blank', text: 'ja' });
    expect(state.status).toBe('in_progress');
  });

  it('still throws on an invalid bundled exam', () => {
    const { service } = setup();
    expect(() => service.syncBundledExam(examFile([{ id: 'x' } as unknown as PlacementQuestion]))).toThrow(/Bundled placement exam is invalid/);
  });
});
