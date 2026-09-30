import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { QueuePage } from './QueuePage';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

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
  it('leaves straight away before anything is answered, and asks once a review is answered', async () => {
    push.mockClear();
    stubFetch(QUEUE);
    renderWithIntl(<QueuePage />);
    await screen.findByText('2 reviews left today');
    expect(screen.getByRole('progressbar', { name: 'Exercise 1 of 2' })).toBeInTheDocument();
    // Esc with nothing answered: no confirmation.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(push).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    push.mockClear();
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await screen.findByRole('button', { name: 'Next' });
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('picks an option with a number key and checks with Enter', async () => {
    const fetchMock = stubFetch(QUEUE);
    renderWithIntl(<QueuePage />);
    await screen.findByText('2 reviews left today');
    fireEvent.keyDown(document.body, { key: '2' });
    expect(screen.getByLabelText('Tschüss')).toBeChecked();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await screen.findByRole('button', { name: 'Next' });
    expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/tutoring/attempts')?.[1]?.body as string).answer).toEqual({
      type: 'multiple_choice',
      selectedIndex: 1,
    });
  });

  it('shows no exit button or progress bar for an empty queue', async () => {
    stubFetch({ ...QUEUE, items: [] });
    renderWithIntl(<QueuePage />);
    await screen.findByText('Nothing to review right now.');
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

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
