import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { TestOutPage } from './TestOutPage';

const BASE = '/api/tutoring/milestones/m2/testout';
const Q1 = { id: 'q1', type: 'multiple_choice', question: 'First?', options: ['ja', 'nein'] };
const Q2 = { id: 'q2', type: 'fill_blank', textWithBlank: 'Ich ___ hier.' };
const STATE = (status: unknown, lastResult: unknown = null) => ({ milestone: { id: 'm2', title: 'Later' }, status, lastResult });
const RESULT = {
  passed: true,
  score: 1.5,
  maxScore: 2,
  review: [
    { exercise: Q1, answerText: 'ja', result: 'correct', correctAnswer: 'ja' },
    { exercise: Q2, answerText: 'ist', result: 'wrong', correctAnswer: 'bin' },
  ],
};

function stub(routes: Record<string, (() => Promise<unknown>)[]>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const queue = routes[key];
    if (!queue || queue.length === 0) throw new Error(`Unexpected fetch: ${key}`);
    return (queue.length > 1 ? queue.shift()! : queue[0])();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TestOutPage', () => {
  it('starts, asks one question at a time without feedback, then shows the result and review', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'available' }))],
      [`POST ${BASE}`]: [() => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 0 })],
      [`POST ${BASE}/answer`]: [
        () => delayedResponse({ finished: false, answered: 1, total: 2 }),
        () => delayedResponse({ finished: true, result: RESULT }),
      ],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByRole('heading', { name: 'Test out: Later' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));

    expect(await screen.findByText('Question 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Right')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'ist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Passed! This milestone is complete.')).toBeInTheDocument();
    expect(screen.getByText('1.5 of 2 points')).toBeInTheDocument();
    expect(screen.getByText('Your answer: ist')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: bin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your lessons' })).toHaveAttribute('href', '/');
  });

  it('resumes an attempt at the next unanswered question', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'in_progress', answered: 1, total: 2 }))],
      [`POST ${BASE}`]: [() => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 1 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume the test' }));
    expect(await screen.findByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Ich ___ hier.')).toBeInTheDocument();
  });

  it('reloads the attempt when a question went stale', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'in_progress', answered: 0, total: 2 }))],
      [`POST ${BASE}`]: [
        () => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 0 }),
        () => delayedResponse({ attemptId: 1, questions: [Q2], answered: 0 }),
      ],
      [`POST ${BASE}/answer`]: [() => delayedResponse({ error: 'gone', code: 'not_found' }, { ok: false, status: 404 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume the test' }));
    fireEvent.click(await screen.findByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument();
  });

  it('explains a cooldown, a missing test-out, and a load failure', async () => {
    stub({ [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'cooldown', retryAt: '2026-09-30T10:00:00.000Z' }))] });
    const first = renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByText(/You can try again after/)).toBeInTheDocument();
    first.unmount();

    stub({ [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'none' }))] });
    const second = renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByText("This test-out isn't available right now.")).toBeInTheDocument();
    second.unmount();

    stub({ [`GET ${BASE}`]: [() => delayedResponse({}, { ok: false, status: 500 })] });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the test-out. Please reload the page.');
  });

  it('disables the start button while the attempt is being created', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'available' }))],
      [`POST ${BASE}`]: [() => delayedResponse({ attemptId: 1, questions: [Q1], answered: 0 }, { ms: 50 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    const button = await screen.findByRole('button', { name: 'Start the test' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await waitFor(() => expect(screen.getByText('Question 1 of 1')).toBeInTheDocument());
  });

  it('shows the last result again after a reload', async () => {
    stub({ [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'none' }, RESULT))] });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByText('Passed! This milestone is complete.')).toBeInTheDocument();
    expect(screen.getByText('1.5 of 2 points')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: bin')).toBeInTheDocument();
  });

  it('shows the result when the attempt was settled while a question was open', async () => {
    stub({
      [`GET ${BASE}`]: [
        () => delayedResponse(STATE({ status: 'in_progress', answered: 0, total: 2 })),
        () => delayedResponse(STATE({ status: 'none' }, RESULT)),
      ],
      [`POST ${BASE}`]: [
        () => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 0 }),
        () => delayedResponse({ error: 'settled', code: 'conflict' }, { ok: false, status: 409 }),
      ],
      [`POST ${BASE}/answer`]: [() => delayedResponse({ error: 'settled', code: 'conflict' }, { ok: false, status: 409 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume the test' }));
    fireEvent.click(await screen.findByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Passed! This milestone is complete.')).toBeInTheDocument();
    expect(screen.getByText('1.5 of 2 points')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the instruction in the review when the question text is empty', async () => {
    const q = { id: 'q3', type: 'multiple_choice', question: '', instruction: { en: 'Pick the right verb', de: 'Wähle das richtige Verb' }, options: ['bin', 'ist'] };
    stub({
      [`GET ${BASE}`]: [
        () =>
          delayedResponse(
            STATE({ status: 'none' }, { passed: false, score: 0, maxScore: 1, review: [{ exercise: q, answerText: 'ist', result: 'wrong', correctAnswer: 'bin' }] }),
          ),
      ],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByText('Pick the right verb')).toBeInTheDocument();
  });
});
