import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@/lib/services/aiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/aiService')>()),
  generateWithActiveProvider: vi.fn(),
}));

import { getDb, closeDb } from '@/lib/db/client';
import { generateWithActiveProvider } from '@/lib/services/aiService';
import { addSecondMilestone, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { GET, POST } from './route';

function post(id: string, body: unknown) {
  return POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

describe('/api/tutoring/lessons/[id]/chat', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-chat-'));
    seedTutoringCurriculum(getDb());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    vi.mocked(generateWithActiveProvider).mockReset();
  });

  it('GET returns the thread, or 404 and 403', async () => {
    const request = new Request('http://localhost');
    expect(await (await GET(request, { params: Promise.resolve({ id: 'a1-greet' }) })).json()).toEqual({ messages: [], aiAvailable: false });
    expect((await GET(request, { params: Promise.resolve({ id: 'nope' }) })).status).toBe(404);
    expect((await GET(request, { params: Promise.resolve({ id: 'a2-past' }) })).status).toBe(403);
  });

  it('POST sends a message and returns the new messages', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: 'Hallo!' });
    const res = await post('a1-greet', { message: 'Hi?' });
    expect(res.status).toBe(200);
    expect((await res.json()).messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ['user', 'Hi?'],
      ['assistant', 'Hallo!'],
    ]);
  });

  it('POST answers 502 when the AI fails, and 400 for a malformed body', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' });
    const failed = await post('a1-greet', { message: 'Hi?' });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'No AI provider is set up', code: 'no_provider' });
    expect((await post('a1-greet', { message: 42 })).status).toBe(400);
    expect((await post('a1-greet', { message: 'Hi?', exerciseId: 7 })).status).toBe(400);
  });

  it('POST validates the practice answer that comes with a practice exercise', async () => {
    expect((await post('a1-greet', { message: 'Hi?', practiceExerciseId: 'px-1' })).status).toBe(400);
    expect(
      (await post('a1-greet', { message: 'Hi?', practiceExerciseId: 'px-1', practiceAnswer: { answerText: 'x', result: 'great' } })).status
    ).toBe(400);
  });

  it('POST refuses a locked lesson before calling the AI', async () => {
    addSecondMilestone(getDb());
    const res = await post('a1-late', { message: 'Hallo?' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'lesson_locked' });
    expect(generateWithActiveProvider).not.toHaveBeenCalled();
  });
});
