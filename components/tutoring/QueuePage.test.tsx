import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { QueuePage } from './QueuePage';

const QUEUE = {
  track: 'generic',
  level: 'A1',
  cap: 50,
  answeredToday: 0,
  items: [
    {
      lessonId: 'a1-greet',
      lessonTitle: 'Saying hello',
      exercise: { id: 'ex1', type: 'multiple_choice', question: 'Greeting?', options: ['Hallo', 'Tschüss'] },
    },
    { lessonId: 'a1-sein', lessonTitle: 'The verb sein', exercise: { id: 'ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' } },
  ],
  suggestedLesson: { id: 'a1-bye', title: 'Saying goodbye' },
};

const OUTCOME = {
  result: 'correct',
  correctAnswer: 'x',
  feedback: null,
  passedExerciseIds: [],
  lessonCompleted: true,
  justCompleted: false,
};

function stubFetch(queue: unknown, options: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url === '/api/tutoring/queue') return delayedResponse(queue, options);
    if (url === '/api/tutoring/attempts') return delayedResponse(OUTCOME);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('QueuePage', () => {
  it('works through the due reviews one at a time, then suggests the next lesson', async () => {
    const fetchMock = stubFetch(QUEUE);
    renderWithIntl(<QueuePage />);

    expect(await screen.findByText('2 reviews left today')).toBeInTheDocument();
    expect(screen.getByText('From the lesson: Saying hello')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByText('1 review left today')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'bin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByText('All done for today. Well done!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying goodbye' })).toHaveAttribute('href', '/lesson/a1-bye');
    const attemptBody = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/tutoring/attempts')?.[1]?.body as string);
    expect(attemptBody).toMatchObject({ exerciseId: 'ex1', source: 'queue' });
  });

  it('says when nothing is due', async () => {
    stubFetch({ ...QUEUE, items: [] });
    renderWithIntl(<QueuePage />);
    expect(await screen.findByText('Nothing to review right now.')).toBeInTheDocument();
  });

  it('says when the daily limit is reached, and when every lesson is done', async () => {
    stubFetch({ ...QUEUE, items: [], answeredToday: 50, suggestedLesson: null });
    renderWithIntl(<QueuePage />);
    expect(await screen.findByText("You reached today's review limit. The rest wait until tomorrow.")).toBeInTheDocument();
    expect(screen.getByText('You have finished every lesson at this level.')).toBeInTheDocument();
  });

  it('shows an error when the queue cannot load', async () => {
    stubFetch({}, { ok: false, status: 500 });
    renderWithIntl(<QueuePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Could not load today's reviews. Please reload the page.");
  });
});
