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

describe('TeilRunner with a listening part', () => {
  const AUDIO_RUN = {
    ...RUN,
    attemptId: 11,
    formatId: 'telc-b1',
    part: { id: 'hoeren-1', skill: 'listening', title: { en: 'Listening Part 1', de: 'Hörverstehen Teil 1' }, taskType: 'audio_questions', items: 1, points: 5, minutes: 1, instructions: 'Sie hören …', replays: 1 },
    set: { id: 's2', view: { audio: { hash: 'd'.repeat(64), available: true }, questions: [{ question: 'Anna kommt um acht.', options: ['Richtig', 'Falsch'] }] } },
  };

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    });
  });

  it('starts with every question unanswered, plays within the part replays, and submits', async () => {
    const result = { attemptId: 11, score: 5, maxScore: 5, overtimeSeconds: 0, review: [] };
    const fetchMock = vi.fn(() => delayedResponse(result));
    vi.stubGlobal('fetch', fetchMock);
    const onFinished = vi.fn();
    const { container } = renderWithIntl(
      <ShellProvider>
        <TeilRunner run={AUDIO_RUN as never} onFinished={onFinished} />
      </ShellProvider>
    );
    const audio = container.ownerDocument.querySelector('audio')!;
    expect(audio).toHaveAttribute('src', `/api/audio/${'d'.repeat(64)}`);
    // Exam mode: no rewind or speed, and no transcript.
    expect(screen.queryByRole('button', { name: 'Back 5 seconds' })).toBeNull();
    expect(screen.getByText('Played 0 of 1 time')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent(audio, new Event('ended'));
    expect(screen.getByText('Played 1 of 1 time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Falsch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledWith(result));
    expect(fetchMock).toHaveBeenCalledWith('/api/exam-practice/submit', expect.objectContaining({
      body: JSON.stringify({ attemptId: 11, answers: { type: 'audio_questions', selected: [1] } }),
    }));
  });
});
