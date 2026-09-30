import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { PracticeRun } from './PracticeRun';

const BATCH = {
  exercises: [
    { id: 'px-1', type: 'multiple_choice', question: 'First?', options: ['ja', 'nein'] },
    { id: 'px-2', type: 'multiple_choice', question: 'Second?', options: ['ja', 'nein'] },
  ],
};

function stubFetch(batch: () => Promise<unknown>, answers: (() => Promise<unknown>)[] = []) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url === '/api/tutoring/lessons/a1-greet/practice') return batch();
    if (url === '/api/tutoring/practice/answer') {
      const next = answers.shift();
      if (!next) throw new Error('Unexpected answer');
      return next();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function answerWith(option: string) {
  fireEvent.click(screen.getByLabelText(option));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
}

describe('PracticeRun', () => {
  it('runs a batch one exercise at a time, then shows a summary and offers more', async () => {
    const fetchMock = stubFetch(() => delayedResponse(BATCH), [
      () => delayedResponse({ result: 'correct', correctAnswer: 'ja' }),
      () => delayedResponse({ result: 'wrong', correctAnswer: 'ja' }),
    ]);
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    // Review Focus 1: no second batch while one is loading.
    expect(screen.getByRole('button', { name: 'Get more exercises' })).toBeDisabled();
    expect(screen.getByText('Preparing exercises…')).toBeInTheDocument();

    expect(await screen.findByText('Practice 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('First?')).toBeInTheDocument();
    await answerWith('ja');
    expect(await screen.findByText('Practice 2 of 2')).toBeInTheDocument();
    await answerWith('nein');

    expect(await screen.findByText('1 right, 0 almost, 1 wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get more exercises' })).not.toBeDisabled();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/tutoring/lessons/a1-greet/practice')).toHaveLength(1);
  });

  it('counts a skipped exercise in the summary', async () => {
    stubFetch(() => delayedResponse({ exercises: [BATCH.exercises[0]] }), [
      () => delayedResponse({ error: 'gone', code: 'not_found' }, { ok: false, status: 404 }),
    ]);
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    fireEvent.click(await screen.findByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('0 right, 0 almost, 0 wrong')).toBeInTheDocument();
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('shows the generation failure with a Settings link and lets the student try again', async () => {
    stubFetch(() => delayedResponse({ error: 'No AI provider is set up', code: 'no_provider' }, { ok: false, status: 502 }));
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No practice exercises could be prepared: No AI provider is set up.'
    );
    expect(screen.getByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get more exercises' })).not.toBeDisabled());
  });

  it('passes Ask AI through with the practice answer', async () => {
    stubFetch(() => delayedResponse({ exercises: [BATCH.exercises[0]] }), [
      () => delayedResponse({ result: 'wrong', correctAnswer: 'ja' }),
    ]);
    const onAskAi = vi.fn();
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={onAskAi} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    fireEvent.click(await screen.findByLabelText('nein'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask AI' }));
    expect(onAskAi).toHaveBeenCalledWith('px-1', { answerText: 'nein', result: 'wrong' });
  });
});
