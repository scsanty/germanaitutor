import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { AttemptSource } from '@/lib/tutoring/lessonAnswers';
import { ExerciseCard } from './ExerciseCard';

const MC: ExerciseView = { id: 'ex1', type: 'multiple_choice', question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'] };
const FILL: ExerciseView = { id: 'ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' };
const CARD: ExerciseView = { id: 'ex3', type: 'flashcard', front: 'der Hund', back: 'the dog' };
const FREE: ExerciseView = { id: 'ex4', type: 'free_text', prompt: 'Say that you are tired.' };

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    result: 'correct',
    correctAnswer: 'Hallo',
    feedback: null,
    passedExerciseIds: [],
    lessonCompleted: false,
    justCompleted: false,
    ...overrides,
  };
}

function stubAttempts(...responses: (() => Promise<unknown>)[]) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderCard(exercise: ExerciseView, source: AttemptSource = 'lesson') {
  const props = { onAnswered: vi.fn(), onNext: vi.fn(), onSkip: vi.fn(), onAskAi: vi.fn() };
  renderWithIntl(<ExerciseCard exercise={exercise} source={source} {...props} />);
  return props;
}

describe('ExerciseCard', () => {
  it('sends a multiple-choice answer, shows the result, and offers Ask AI and Next', async () => {
    const fetchMock = stubAttempts(() => delayedResponse(outcome()));
    const props = renderCard(MC);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(check);

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: 'ex1', answer: { type: 'multiple_choice', selectedIndex: 0 }, source: 'lesson' }),
    });
    expect(props.onAnswered).toHaveBeenCalledWith(outcome());
    expect(screen.queryByText(/Correct answer:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(props.onAskAi).toHaveBeenCalledWith('ex1', { answerText: 'Hallo', result: 'correct' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(props.onNext).toHaveBeenCalled();
  });

  it('shows the correct answer after a wrong fill-in answer', async () => {
    stubAttempts(() => delayedResponse(outcome({ result: 'wrong', correctAnswer: 'bin' })));
    renderCard(FILL);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'bist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: bin')).toBeInTheDocument();
  });

  it("reveals a flashcard and grades it with the student's own rating, without Ask AI", async () => {
    const fetchMock = stubAttempts(() => delayedResponse(outcome({ correctAnswer: null })));
    renderCard(CARD);
    expect(screen.getByText('der Hund')).toBeInTheDocument();
    expect(screen.queryByText('the dog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('the dog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Knew it' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ answer: { type: 'flashcard', rating: 'knew' } });
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('keeps a free-text answer and offers Settings and Skip when grading fails', async () => {
    stubAttempts(() => delayedResponse({ error: 'No AI provider is set up' }, { ok: false, status: 502 }));
    const props = renderCard(FREE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin müde.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer could not be graded: No AI provider is set up.');
    expect(screen.getByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByLabelText('Your answer')).toHaveValue('Ich bin müde.');
    expect(props.onAnswered).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(props.onSkip).toHaveBeenCalled();
  });

  it('shows the model answer and the AI feedback for free text', async () => {
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Ich bin müde.', feedback: 'Watch the umlaut.' })));
    renderCard(FREE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Almost — that counts as passed.')).toBeInTheDocument();
    expect(screen.getByText('Model answer: Ich bin müde.')).toBeInTheDocument();
    expect(screen.getByText('Feedback: Watch the umlaut.')).toBeInTheDocument();
  });

  it('shows any other failure as an error', async () => {
    stubAttempts(() => delayedResponse({ error: 'Level A2 is locked' }, { ok: false, status: 403 }));
    renderCard(MC);
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: Level A2 is locked');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).not.toBeDisabled());
    // In a lesson run, a generic error has no "skip"; the retry round already handles that.
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
  });

  // M-4: on the Daily Queue there is no retry round, so a non-grading error (a 403, a deleted
  // exercise, a network drop) must not strand the student with only a disabled path forward.
  it('offers Skip for any error on the Daily Queue, not only a grading failure', async () => {
    stubAttempts(() => delayedResponse({ error: 'Level A2 is locked' }, { ok: false, status: 403 }));
    const props = renderCard(MC, 'queue');
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: Level A2 is locked');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(props.onSkip).toHaveBeenCalled();
  });

  it('shows a coded error in the interface language', async () => {
    stubAttempts(() =>
      delayedResponse({ error: 'Level A2 is locked', code: 'level_locked', params: { level: 'A2' } }, { ok: false, status: 403 })
    );
    renderCard(MC);
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: Level A2 is locked');
  });

  it('in practice mode grades through the practice endpoint and shows Wrong with the correct answer', async () => {
    const fetchMock = stubAttempts(() => delayedResponse({ result: 'wrong', correctAnswer: 'Hallo' }));
    const onPracticeAnswered = vi.fn();
    const onAskAi = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="practice" onPracticeAnswered={onPracticeAnswered} onNext={vi.fn()} onSkip={vi.fn()} onAskAi={onAskAi} />
    );
    fireEvent.click(screen.getByLabelText('Tschüss'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('Wrong')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Hallo')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/practice/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceExerciseId: 'ex1', answer: { type: 'multiple_choice', selectedIndex: 1 } }),
    });
    expect(onPracticeAnswered).toHaveBeenCalledWith({ result: 'wrong', correctAnswer: 'Hallo' });
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(onAskAi).toHaveBeenCalledWith('ex1', { answerText: 'Tschüss', result: 'wrong' });
  });

  it('in practice mode shows Right alone, and Almost with the model answer for free text', async () => {
    stubAttempts(() => delayedResponse({ result: 'correct', correctAnswer: 'Hallo' }));
    const { unmount } = renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="practice" onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Right')).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer:/)).not.toBeInTheDocument();
    unmount();

    stubAttempts(() => delayedResponse({ result: 'almost', correctAnswer: 'Ich bin müde.' }));
    renderWithIntl(<ExerciseCard exercise={FREE} source="lesson" mode="practice" onNext={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Almost')).toBeInTheDocument();
    expect(screen.getByText('Model answer: Ich bin müde.')).toBeInTheDocument();
  });

  it('in practice mode offers Skip for any error, such as an exercise removed mid-batch', async () => {
    stubAttempts(() => delayedResponse({ error: 'Practice exercise not found: ex1', code: 'not_found' }, { ok: false, status: 404 }));
    const onSkip = vi.fn();
    renderWithIntl(<ExerciseCard exercise={MC} source="lesson" mode="practice" onNext={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: That could not be found');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(onSkip).toHaveBeenCalled();
  });
});
