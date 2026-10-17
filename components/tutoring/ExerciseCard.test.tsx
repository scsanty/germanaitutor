import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { AttemptSource } from '@/lib/tutoring/lessonAnswers';
import { ExerciseCard } from './ExerciseCard';

const MC: ExerciseView = { id: 'ex1', type: 'multiple_choice', question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'], instruction: { en: 'Pick the greeting.', de: 'Wähle die Begrüßung.' } };
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
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Ich bin müde.', feedback: { en: 'Watch the umlaut.', de: 'Achte auf den Umlaut.' } })));
    renderCard(FREE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Almost — that counts as passed.')).toBeInTheDocument();
    expect(screen.getByText('Model answer: Ich bin müde.')).toBeInTheDocument();
    expect(screen.getByText('Feedback: Watch the umlaut.')).toBeInTheDocument();
  });

  it('names the fieldset by the instruction when the multiple-choice question is empty', () => {
    renderWithIntl(<ExerciseCard exercise={{ ...MC, question: '' }} source="lesson" onAnswered={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Pick the greeting.' })).toBeInTheDocument();
  });

  it('shows the instruction in the content language, and feedback with its own toggle', async () => {
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Ich bin müde.', feedback: { en: 'Watch the umlaut.', de: 'Achte auf den Umlaut.' } })));
    renderWithIntl(<ExerciseCard exercise={{ ...FREE, instruction: { en: 'Say you are tired.', de: 'Sag, dass du müde bist.' } }} source="lesson" contentLanguage="de" onAnswered={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Sag, dass du müde bist.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Feedback: Watch the umlaut.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Feedback: Achte auf den Umlaut.')).toBeInTheDocument();
  });

  it.each([
    ['legacy plain-text feedback', { en: 'Watch the umlaut.', de: 'Watch the umlaut.' }],
    ['feedback with no German version', { en: 'Watch the umlaut.', de: '' }],
  ])('shows no feedback toggle for %s', async (_name, feedback) => {
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Ich bin müde.', feedback })));
    renderCard(FREE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Feedback: Watch the umlaut.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Feedback language' })).not.toBeInTheDocument();
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

  it('in test mode posts to the test-out route and shows no result', async () => {
    const fetchMock = stubAttempts(() => delayedResponse({ finished: false, answered: 1, total: 6 }));
    const onTestAnswered = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="test" testMilestoneId="m2" onTestAnswered={onTestAnswered} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Tschüss'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(onTestAnswered).toHaveBeenCalledWith({ finished: false, answered: 1, total: 6 }));
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/milestones/m2/testout/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: 'ex1', answer: { type: 'multiple_choice', selectedIndex: 1 } }),
    });
    expect(screen.queryByText('Wrong')).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  });

  it('in test mode reports a stale question and never offers Skip', async () => {
    stubAttempts(() => delayedResponse({ error: 'gone', code: 'not_found' }, { ok: false, status: 404 }));
    const onTestStale = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="test" testMilestoneId="m2" onTestStale={onTestStale} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(onTestStale).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
  });

  it('in test mode treats a 400 bad_request (not the next question) as stale', async () => {
    stubAttempts(() => delayedResponse({ error: 'not the next question', code: 'bad_request' }, { ok: false, status: 400 }));
    const onTestStale = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="test" testMilestoneId="m2" onTestStale={onTestStale} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(onTestStale).toHaveBeenCalled());
  });
  it('answers a cloze exercise inline and shows per-gap results after checking', async () => {
    const CLOZE = {
      id: 'c1',
      type: 'cloze' as const,
      text: 'Ich {{1}} müde. Er {{2}} hier.',
      gaps: [{ mode: 'typed' as const }, { mode: 'select' as const, options: ['ist', 'bin'] }],
    };
    const fetchMock = stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'bin; ist' })));
    renderWithIntl(<ExerciseCard exercise={CLOZE} source="lesson" onAnswered={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Gap 1'), { target: { value: 'bin' } });
    fireEvent.change(screen.getByLabelText('Gap 2'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    // S16: lesson mode shows exercise.result.almost.
    expect(await screen.findByText('Almost — that counts as passed.')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: bin; ist')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/attempts', expect.objectContaining({
      body: JSON.stringify({ exerciseId: 'c1', answer: { type: 'cloze', values: ['bin', 1] }, source: 'lesson' }),
    }));
  });

  it('keeps a reading task visible after Check with a mark per gap, and sends typed gaps exactly as typed (S17)', async () => {
    const CLOZE: ExerciseView = {
      id: 'c2',
      type: 'cloze',
      text: 'Ich {{1}} müde. Er {{2}} hier.',
      gaps: [{ mode: 'typed' }, { mode: 'typed' }],
    };
    const fetchMock = stubAttempts(() => delayedResponse(outcome({ result: 'wrong', correctAnswer: 'bin; ist', itemResults: [true, false] })));
    const props = renderCard(CLOZE);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Gap 1'), { target: { value: ' Bin ' } });
    expect(check).toBeEnabled();
    fireEvent.click(check);
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).answer).toEqual({ type: 'cloze', values: [' Bin ', null] });
    expect(screen.getByLabelText('Gap 1')).toBeDisabled();
    expect(screen.getByLabelText('Gap 1')).toHaveValue(' Bin ');
    expect(screen.getByText('Right')).toBeInTheDocument();
    expect(screen.getByText('Wrong or unanswered')).toBeInTheDocument();
    expect(screen.queryByText(/\{\{1\}\}/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(props.onAskAi).toHaveBeenCalledWith('c2', { answerText: 'Bin; —', result: 'wrong' });
  });

  it('answers a matching exercise and asks the AI with the chosen texts, not their numbers', async () => {
    const MATCH: ExerciseView = { id: 'm1', type: 'matching', items: ['Ich suche ein Zimmer.', 'Ich will kochen.'], targets: ['Wohnungsmarkt', 'Kochkurs'], allowNone: true };
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Wohnungsmarkt; Kochkurs', itemResults: [true, false] })));
    const props = renderCard(MATCH);
    fireEvent.change(screen.getByLabelText('1. Ich suche ein Zimmer.'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('2. Ich will kochen.'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Almost — that counts as passed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(props.onAskAi).toHaveBeenCalledWith('m1', { answerText: 'Wohnungsmarkt; x', result: 'almost' });
  });
  it('keeps the per-question mark out of the radio group name after Check (fix #5)', async () => {
    const PQ: ExerciseView = { id: 'p1', type: 'passage_questions', passage: 'Anna wohnt in Köln.', questions: [{ question: 'Wo wohnt Anna?', options: ['Köln', 'Bonn'] }] };
    stubAttempts(() => delayedResponse(outcome({ result: 'correct', correctAnswer: 'Köln', itemResults: [true] })));
    renderCard(PQ);
    fireEvent.click(screen.getByLabelText('Köln'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: '1. Wo wohnt Anna?' })).toBeInTheDocument();
    expect(screen.getByText('Right')).toBeInTheDocument();
  });
  it('plays a listening task and reveals the transcript with its evidence only after Check', async () => {
    const AQ: ExerciseView = {
      id: 'a1',
      type: 'audio_questions',
      audio: { hash: 'c'.repeat(64), available: true },
      questions: [{ question: 'Wann kommt Anna?', options: ['um acht', 'um neun'] }],
    };
    const reveal = {
      transcript: { filter: 'none', lines: [{ label: 'Anna', gender: 'f', text: 'Ich komme um acht Uhr.', voice: 'kerstin' }] },
      evidence: ['um acht Uhr'],
      evidenceLines: [0],
    };
    stubAttempts(() => delayedResponse(outcome({ result: 'correct', correctAnswer: 'um acht', itemResults: [true], reveal })));
    renderCard(AQ);
    // Lesson mode: unlimited plays, −5 s and 0.75×; no transcript before answering.
    expect(document.querySelector('audio')).toHaveAttribute('src', `/api/audio/${'c'.repeat(64)}`);
    expect(screen.getByRole('button', { name: 'Back 5 seconds' })).toBeInTheDocument();
    expect(screen.queryByText('Transcript')).toBeNull();
    expect(screen.queryByText(/Ich komme/)).toBeNull();
    fireEvent.click(screen.getByLabelText('um acht'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('heading', { name: 'Transcript' })).toBeInTheDocument();
    expect(document.querySelector('mark')).toHaveTextContent('um acht Uhr');
    expect(screen.getByText('Anna:')).toBeInTheDocument();
  });
});
