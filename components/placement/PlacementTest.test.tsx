import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { PlacementTest } from './PlacementTest';

const MC_QUESTION = {
  id: 'q1',
  position: 1,
  total: 3,
  level: 'A1',
  type: 'multiple_choice',
  question: 'Ich ___ Anna.',
  options: ['heißt', 'heiße'],
};
const FREE_QUESTION = { id: 'q2', position: 2, total: 3, level: 'A2', type: 'free_text', prompt: 'Schreib etwas.' };
const OUTCOME = {
  score: 1,
  maxScore: 8,
  placedLevel: 'A1',
  stopReason: 'beyond_my_knowledge',
  isNewBest: true,
  answers: [
    {
      questionId: 'q1',
      level: 'A1',
      type: 'multiple_choice',
      question: 'Ich ___ Anna.',
      given: 'heiße',
      correctAnswer: 'heiße',
      result: 'correct',
      feedback: null,
    },
  ],
};

function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PlacementTest', () => {
  it('offers Skip only when onSkip is given', () => {
    const onSkip = vi.fn();
    const { unmount } = renderWithIntl(<PlacementTest onFinished={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText('Skip, start at A1'));
    expect(onSkip).toHaveBeenCalled();
    unmount();

    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    expect(screen.queryByText('Skip, start at A1')).not.toBeInTheDocument();
  });

  it('starts the test and shows the first question, with no progress counter', async () => {
    stubFetch({ '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }) });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    expect(await screen.findByText('Ich ___ Anna.')).toBeInTheDocument();
    expect(screen.queryByText(/Question \d+ of \d+/)).not.toBeInTheDocument();
  });

  it('keeps Submit disabled until an answer is chosen, then sends it and shows the next question', async () => {
    const fetchMock = stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }),
      '/api/placement/answer': () => delayedResponse({ status: 'in_progress', question: FREE_QUESTION }),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    await screen.findByText('Ich ___ Anna.');
    expect(screen.getByText('Submit answer')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('heiße'));
    fireEvent.click(screen.getByText('Submit answer'));

    expect(await screen.findByText('Schreib etwas.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/placement/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: 'q1', answer: { type: 'multiple_choice', selectedIndex: 1 } }),
    });
  });

  it('keeps the typed answer and shows the error with a Settings link when grading fails', async () => {
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: FREE_QUESTION }),
      '/api/placement/answer': () => delayedResponse({ error: 'Anthropic returned 429' }, { ok: false, status: 502 }),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    const textarea = await screen.findByLabelText('Your answer');
    fireEvent.change(textarea, { target: { value: 'Ich lerne Deutsch.' } });
    fireEvent.click(screen.getByText('Submit answer'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Your answer could not be graded: Anthropic returned 429')
    );
    expect(screen.getByLabelText('Your answer')).toHaveValue('Ich lerne Deutsch.');
    expect(screen.getByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
  });

  it('clears the previous error as soon as a retry starts', async () => {
    const answerMock = vi
      .fn()
      .mockImplementationOnce(() => delayedResponse({ error: 'Anthropic returned 429' }, { ok: false, status: 502 }))
      .mockImplementationOnce(() => delayedResponse({ status: 'in_progress', question: FREE_QUESTION }, { ms: 50 }));
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: FREE_QUESTION }),
      '/api/placement/answer': answerMock,
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    const textarea = await screen.findByLabelText('Your answer');
    fireEvent.change(textarea, { target: { value: 'Ich lerne Deutsch.' } });
    fireEvent.click(screen.getByText('Submit answer'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Submit answer'));
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Let the second (delayed) response settle before the test ends.
    await waitFor(() => expect(screen.queryByText('Checking…')).not.toBeInTheDocument());
  });

  it('ends the test with Beyond my knowledge and shows the result', async () => {
    const onFinished = vi.fn();
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }),
      '/api/placement/stop': () => delayedResponse({ status: 'finished', outcome: OUTCOME }),
    });
    renderWithIntl(<PlacementTest onFinished={onFinished} />);
    fireEvent.click(screen.getByText('Start the test'));
    await screen.findByText('Ich ___ Anna.');
    fireEvent.click(screen.getByText('Beyond my knowledge'));

    expect(await screen.findByText('You placed at A1.')).toBeInTheDocument();
    expect(screen.getByText('Score: 1 of 8 points')).toBeInTheDocument();
    expect(screen.getByText('You stopped with “Beyond my knowledge”.')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: heiße')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue'));
    expect(onFinished).toHaveBeenCalled();
  });

  it('shows an error when the test cannot start', async () => {
    stubFetch({ '/api/placement/start': () => delayedResponse({ error: 'No placement exam is loaded' }, { ok: false, status: 409 }) });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong: No placement exam is loaded')
    );
  });
});
