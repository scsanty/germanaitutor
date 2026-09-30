import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { LessonPage } from './LessonPage';

const LESSON = {
  locked: false,
  id: 'a1-greet',
  title: 'Saying hello',
  track: 'generic',
  level: 'A1',
  skill: 'vocabulary',
  explanation: 'Say Hallo to greet someone.',
  examples: ['Hallo!'],
  exercises: [
    { id: 'ex1', type: 'multiple_choice', question: 'Greeting?', options: ['Hallo', 'Tschüss'] },
    { id: 'ex2', type: 'multiple_choice', question: 'Farewell?', options: ['Hallo', 'Tschüss'] },
  ],
  passedExerciseIds: [] as string[],
  completed: false,
  prerequisites: [{ id: 'a1-basics', title: 'Basics', done: true }],
};

function outcome(result: string, overrides: Record<string, unknown> = {}) {
  return { result, correctAnswer: 'Hallo', feedback: null, passedExerciseIds: [], lessonCompleted: false, justCompleted: false, ...overrides };
}

function stubFetch(routes: Record<string, () => Promise<unknown>>, attempts: (() => Promise<unknown>)[] = []) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (key === 'POST /api/tutoring/attempts') {
      const next = attempts.shift();
      if (!next) throw new Error('Unexpected attempt');
      return next();
    }
    const route = routes[key];
    if (!route) throw new Error(`Unexpected fetch: ${key}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function answer(option: string) {
  fireEvent.click(screen.getByLabelText(option));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
}

describe('LessonPage', () => {
  it('shows the explanation, examples, and prerequisites, then runs the exercises with a retry round', async () => {
    stubFetch(
      { 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON) },
      [
        () => delayedResponse(outcome('wrong')),
        () => delayedResponse(outcome('correct', { passedExerciseIds: ['ex2'] })),
        () => delayedResponse(outcome('correct', { passedExerciseIds: ['ex1', 'ex2'], lessonCompleted: true, justCompleted: true })),
      ]
    );
    renderWithIntl(<LessonPage lessonId="a1-greet" />);

    expect(await screen.findByText('Say Hallo to greet someone.')).toBeInTheDocument();
    expect(screen.getByText('Hallo!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Basics' })).toHaveAttribute('href', '/lesson/a1-basics');

    fireEvent.click(screen.getByRole('button', { name: 'Start the exercises' }));
    expect(screen.getByText('0 of 2 exercises passed')).toBeInTheDocument();
    expect(screen.getByText('Greeting?')).toBeInTheDocument();

    await answer('Tschüss');
    expect(await screen.findByText('Farewell?')).toBeInTheDocument();
    await answer('Tschüss');
    expect(await screen.findByText('Greeting?')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 exercises passed')).toBeInTheDocument();
    await answer('Hallo');

    expect(await screen.findByText('Lesson complete! Its exercises will come back in your daily review.')).toBeInTheDocument();
  });

  it('continues with the exercises not yet passed', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({ ...LESSON, passedExerciseIds: ['ex1'] }) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue the exercises' }));
    expect(screen.getByText('Farewell?')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 exercises passed')).toBeInTheDocument();
  });

  it('runs a completed lesson again as practice', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-greet': () =>
        delayedResponse({ ...LESSON, completed: true, passedExerciseIds: ['ex1', 'ex2'] }),
    });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice again' }));
    expect(screen.getByText('Practice run: this lesson is already complete.')).toBeInTheDocument();
    expect(screen.getByText('Greeting?')).toBeInTheDocument();
  });

  // I-1: an admin deleting the lesson's last unpassed exercise leaves every remaining exercise
  // passed while the lesson itself is still not complete; the student must not be dead-ended.
  it('offers Mark as done when every remaining exercise is already passed but the lesson is not complete', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({ ...LESSON, passedExerciseIds: ['ex1', 'ex2'] }),
    });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue the exercises' }));
    expect(await screen.findByRole('button', { name: 'Mark as done' })).toBeInTheDocument();
    expect(screen.queryByText('All exercises passed.')).not.toBeInTheDocument();
  });

  it('opens the chat about an exercise from Ask AI', async () => {
    stubFetch(
      {
        'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON),
        'GET /api/tutoring/lessons/a1-greet/chat': () => delayedResponse({ messages: [], aiAvailable: true }),
      },
      [() => delayedResponse(outcome('wrong'))]
    );
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start the exercises' }));
    fireEvent.click(screen.getByLabelText('Tschüss'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask AI' }));
    expect(await screen.findByText('Asking about exercise 1')).toBeInTheDocument();
    expect(await screen.findByText('Ask anything about this lesson.')).toBeInTheDocument();
  });

  it('marks a lesson without exercises as done', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-read': () => delayedResponse({ ...LESSON, id: 'a1-read', exercises: [] }),
      'POST /api/tutoring/lessons/a1-read/complete': () => delayedResponse({ completed: true }),
    });
    renderWithIntl(<LessonPage lessonId="a1-read" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as done' }));
    expect(await screen.findByText('Done — this lesson is complete.')).toBeInTheDocument();
  });

  it('shows a locked lesson', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a2-past': () =>
        delayedResponse({ locked: true, id: 'a2-past', title: 'The past', level: 'A2', unlocksAfter: 'A1' }),
    });
    renderWithIntl(<LessonPage lessonId="a2-past" />);
    expect(await screen.findByText('Locked — unlocks after finishing A1.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start the exercises' })).not.toBeInTheDocument();
  });

  it('shows errors for a missing lesson and a failed load', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/nope': () => delayedResponse({ error: 'Lesson not found' }, { ok: false, status: 404 }) });
    renderWithIntl(<LessonPage lessonId="nope" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This lesson does not exist.');
  });

  it('shows an error when the lesson fails to load', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({}, { ok: false, status: 500 }) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this lesson. Please reload the page.');
  });

  it('offers Get more exercises only on a completed lesson', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({ ...LESSON, completed: true, passedExerciseIds: ['ex1', 'ex2'] }) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByRole('button', { name: 'Get more exercises' })).toBeInTheDocument();
  });

  it('does not offer practice before the lesson is completed', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    await screen.findByRole('button', { name: 'Start the exercises' });
    expect(screen.queryByRole('button', { name: 'Get more exercises' })).not.toBeInTheDocument();
  });
});
