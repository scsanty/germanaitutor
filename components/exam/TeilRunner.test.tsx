import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ShellProvider } from '@/components/shell/ShellContext';
import { TeilRunner } from './TeilRunner';

const RUN = {
  attemptId: 7,
  formatId: 'telc-b1',
  part: { id: 'lesen-2', skill: 'reading', title: { en: 'Reading Part 2', de: 'Leseverstehen Teil 2' }, taskType: 'passage_questions', items: 2, points: 10, minutes: 1, instructions: 'Lesen Sie …' },
  set: { id: 's1', view: { passage: 'Anna wohnt in Köln.', questions: [{ question: 'Wo wohnt Anna?', options: ['Köln', 'Bonn'] }, { question: 'Wer?', options: ['Anna', 'Ben'] }] } },
  minutes: 1,
  startedAt: new Date().toISOString(),
  mockId: null,
};

describe('TeilRunner', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('counts down, marks overtime without stopping, and submits the answers', async () => {
    const result = { attemptId: 7, score: 10, maxScore: 10, overtimeSeconds: 5, review: [] };
    const fetchMock = vi.fn(() => delayedResponse(result));
    vi.stubGlobal('fetch', fetchMock);
    const onFinished = vi.fn();
    renderWithIntl(
      <ShellProvider>
        <TeilRunner run={RUN as never} onFinished={onFinished} />
      </ShellProvider>
    );
    expect(screen.getByText('01:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Köln' }));
    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText("Time's up: you can finish; this attempt will be marked as overtime.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Anna' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledWith(result));
    expect(fetchMock).toHaveBeenCalledWith('/api/exam-practice/submit', expect.objectContaining({
      body: JSON.stringify({ attemptId: 7, answers: { type: 'passage_questions', selected: [0, 0] } }),
    }));
  });

  it('keeps the answers when submitting fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ error: 'x', code: 'not_found' }, { ok: false, status: 404 })));
    renderWithIntl(
      <ShellProvider>
        <TeilRunner run={RUN as never} onFinished={vi.fn()} />
      </ShellProvider>
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Köln' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That could not be found');
    expect(screen.getByRole('radio', { name: 'Köln' })).toBeChecked();
  });
});
