import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { serializePlacementExam } from '@/lib/tutoring/placementExamFormat';
import { smallPlacementExam } from '@/test/placementFixtures';
import { GET, PUT } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function put(body: string, format = 'json') {
  return PUT(new Request(`http://localhost/api/admin/placement-exam?format=${format}`, { method: 'PUT', body }));
}

describe('/api/admin/placement-exam', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-exam-admin-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    createPlacementService(getDb()).replaceExam(smallPlacementExam());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    expect((await GET(new Request('http://localhost/api/admin/placement-exam'))).status).toBe(401);
    expect((await put('{}')).status).toBe(401);
  });

  it('downloads the exam as JSON by default and as YAML on request', async () => {
    const json = await GET(new Request('http://localhost/api/admin/placement-exam'));
    expect(json.headers.get('Content-Disposition')).toBe('attachment; filename="placement-exam.json"');
    expect(await json.text()).toBe(serializePlacementExam(smallPlacementExam(), 'json'));

    const yaml = await GET(new Request('http://localhost/api/admin/placement-exam?format=yaml'));
    expect(yaml.headers.get('Content-Disposition')).toBe('attachment; filename="placement-exam.yaml"');
    expect(await yaml.text()).toBe(serializePlacementExam(smallPlacementExam(), 'yaml'));
  });

  it('replaces the exam with a valid upload', async () => {
    // One multiple-choice question per level: 5 questions, still covering A1 to C1.
    const exam = smallPlacementExam().filter((q) => q.type === 'multiple_choice');
    const res = await put(serializePlacementExam(exam, 'yaml'), 'yaml');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, questionCount: 5 });
    expect(createPlacementService(getDb()).questionCount()).toBe(5);
  });

  it('rejects an invalid upload with every error and changes nothing', async () => {
    const res = await put(JSON.stringify({ questions: [{ id: 'x', level: 'A1', type: 'flashcard', content: {} }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toContain('Question 1 (x): type must be one of multiple_choice, fill_blank, free_text');
    expect(createPlacementService(getDb()).questionCount()).toBe(10);
  });

  it('rejects an unknown format', async () => {
    expect((await put('{}', 'xml')).status).toBe(400);
  });
});
