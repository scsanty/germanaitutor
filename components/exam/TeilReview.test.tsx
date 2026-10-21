import { describe, it, expect, vi, afterEach } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { axe, expectNoViolations } from '@/test/axe';
import type { TaskAnswer, TaskView } from '@/lib/tasks/taskTypes';
import { TeilReview } from './TeilReview';
import { emptyAnswer, TaskInputs } from './TaskInputs';

const RUN = {
  attemptId: 7,
  formatId: 'telc-b1',
  part: { id: 'lesen-1', skill: 'reading', title: { en: 'Reading Part 1', de: 'Leseverstehen Teil 1' }, taskType: 'matching', items: 2, points: 10, minutes: 20, instructions: 'Lesen Sie …' },
  set: { id: 's1', view: { items: ['Ein Hund', 'Eine Katze'], targets: ['Hunde', 'Katzen'], allowNone: true } },
  minutes: 20,
  startedAt: new Date().toISOString(),
  mockId: null,
};
const RESULT = {
  attemptId: 7,
  score: 5,
  maxScore: 10,
  overtimeSeconds: 90,
  review: [
    { index: 0, answerText: 'Hunde', right: true, correct: 'Hunde', explanation: { en: 'Text a is about dogs.', de: 'Text a handelt von Hunden.' } },
    { index: 1, answerText: '', right: false, correct: 'x', explanation: { en: 'No text fits.', de: 'Kein Text passt.' } },
  ],
};

function Harness({ type, view, onAnswer }: { type: 'matching' | 'cloze'; view: TaskView; onAnswer: (a: TaskAnswer) => void }) {
  const [value, setValue] = useState(() => emptyAnswer(type, view));
  return (
    <TaskInputs
      type={type}
      view={view}
      value={value}
      onChange={(a) => {
        setValue(a);
        onAnswer(a);
      }}
    />
  );
}

describe('TeilReview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the score, overtime, answers, explanations with a language toggle, and is accessible', async () => {
    const { container } = renderWithIntl(<TeilReview result={RESULT as never} run={RUN as never} />);
    expect(screen.getByText('5 of 10 points (50%)')).toBeInTheDocument();
    expect(screen.getByText('2 min over time')).toBeInTheDocument();
    expect(screen.getByText('Your answer: —')).toBeInTheDocument();
    expect(screen.getByText('Right answer: x (none)')).toBeInTheDocument();
    expect(screen.getByText('Text a is about dogs.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Text a handelt von Hunden.')).toBeInTheDocument();
    expectNoViolations(await axe(container));
  });

  it('asks about an item and shows the reply; a failure keeps the explanation and shows an alert', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => delayedResponse({ error: 'x', code: 'no_provider' }, { ok: false, status: 502 }))
      .mockImplementationOnce(() => delayedResponse({ reply: 'Weil Text a von Hunden handelt.' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<TeilReview result={RESULT as never} run={RUN as never} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Ask about this' })[0]);
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Text a is about dogs.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Weil Text a von Hunden handelt.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/exam-practice/explain', expect.objectContaining({
      body: JSON.stringify({ attemptId: 7, itemIndex: 0, question: 'Warum?' }),
    }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('TaskInputs', () => {
  it('matching: -1 is unanswered, "x" is none', () => {
    const onAnswer = vi.fn();
    renderWithIntl(<Harness type="matching" view={RUN.set.view as never} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByLabelText('2. Eine Katze'), { target: { value: 'x' } });
    expect(onAnswer).toHaveBeenLastCalledWith({ type: 'matching', selected: [-1, null] });
    fireEvent.change(screen.getByLabelText('1. Ein Hund'), { target: { value: '1' } });
    expect(onAnswer).toHaveBeenLastCalledWith({ type: 'matching', selected: [1, null] });
  });

  it('cloze: typed gaps have spellcheck off, select and bank gaps are native pickers', () => {
    const onAnswer = vi.fn();
    const view = { text: 'Ich {{1}} gern {{2}} und {{3}}.', gaps: [{ mode: 'typed' }, { mode: 'select', options: ['Tee', 'Kaffee'] }, { mode: 'bank' }], bank: ['Brot', 'Käse'] };
    renderWithIntl(<Harness type="cloze" view={view as never} onAnswer={onAnswer} />);
    const typed = screen.getByLabelText('Gap 1');
    expect(typed).toHaveAttribute('spellcheck', 'false');
    fireEvent.change(typed, { target: { value: 'trinke' } });
    fireEvent.change(screen.getByLabelText('Gap 2'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Gap 3'), { target: { value: '0' } });
    expect(onAnswer).toHaveBeenLastCalledWith({ type: 'cloze', values: ['trinke', 1, 0] });
    expect(screen.getByText('Words to use')).toBeInTheDocument();
  });

  it('cloze: one shared umlaut row acts on the last-focused typed gap', () => {
    localStorage.clear();
    const view = { text: 'Das {{1}} und {{2}}.', gaps: [{ mode: 'typed' }, { mode: 'typed' }] };
    renderWithIntl(<Harness type="cloze" view={view as never} onAnswer={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'äöü' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'äöü' }));
    const two = screen.getByLabelText('Gap 2') as HTMLInputElement;
    two.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Insert ö' }));
    expect(two).toHaveValue('ö');
    expect(screen.getByLabelText('Gap 1')).toHaveValue('');
    localStorage.clear();
  });

  it("reveals a listening part's transcript with the evidence, and names each item by its question", () => {
    const run = {
      ...RUN,
      part: { ...RUN.part, id: 'hoeren-1', skill: 'listening', title: { en: 'Listening Part 1', de: 'Hörverstehen Teil 1' }, taskType: 'audio_questions', replays: 2 },
      set: { id: 's2', view: { audio: { hash: 'f'.repeat(64), available: true }, questions: [{ question: 'Wie fährt Anna?', options: ['Zug', 'Bus'] }] } },
    };
    const result = {
      attemptId: 7, score: 5, maxScore: 5, overtimeSeconds: 0,
      review: [{ index: 0, answerText: 'Bus', right: true, correct: 'Bus', explanation: { en: '', de: '' } }],
      reveal: {
      transcript: { filter: 'none', lines: [{ label: 'Anna', gender: 'f', text: 'Nein, mit dem Bus.', voice: 'kerstin' }] },
      evidence: ['mit dem Bus'],
      evidenceLines: [0],
    },
    };
    const { container } = renderWithIntl(<TeilReview result={result as never} run={run as never} />);
    expect(screen.getByText('1. Wie fährt Anna?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Transcript' })).toBeInTheDocument();
    expect(container.querySelector('mark')).toHaveTextContent('mit dem Bus');
  });

  it('starts a listening task with every question unanswered', () => {
    const view = { audio: { hash: 'f'.repeat(64), available: false }, questions: [{ question: 'A?', options: ['x', 'y'] }, { question: 'B?', options: ['x', 'y'] }] };
    expect(emptyAnswer('audio_questions', view as TaskView)).toEqual({ type: 'audio_questions', selected: [null, null] });
  });
});

// Writing (S11, S17): a letter's review is its grade, with no "Ask about this", and a copy into free writing.
describe('TeilReview for a letter', () => {
  const RUBRIC = {
    criteria: ['aufgabe', 'gestaltung', 'richtigkeit'].map((id, i) => ({
      id,
      name: { en: ['Task completion', 'Communicative design', 'Formal accuracy'][i], de: ['Aufgabenbewältigung', 'Kommunikative Gestaltung', 'Formale Richtigkeit'][i] },
      points: { A: 15, B: 10, C: 5, D: 0 },
      descriptors: { A: 'a', B: 'b', C: 'c', D: 'd' },
    })),
  };
  const SITUATION = 'Sie haben in einem Hotel übernachtet. '.repeat(8).trim();
  const LETTER_RUN = {
    ...RUN,
    attemptId: 21,
    part: { id: 'schreiben', skill: 'writing', title: { en: 'Writing', de: 'Schriftlicher Ausdruck' }, taskType: 'letter', items: 3, points: 45, minutes: 30, instructions: 'Wählen Sie …', rubric: RUBRIC },
    set: { id: 's3', view: { tasks: [{ situation: 'Aufgabe A', leitpunkte: ['a', 'b', 'c'], register: 'informal', wordTarget: { min: 120, max: 180 } }, { situation: SITUATION, leitpunkte: ['a', 'b', 'c'], register: 'formal', wordTarget: { min: 120, max: 180 } }] } },
  };
  const TEXT = 'Sehr geehrte Damen und Herren, ich habe ein Problem mit mein Zimmer.';
  const LETTER_RESULT = {
    attemptId: 21,
    score: 25,
    maxScore: 45,
    overtimeSeconds: 0,
    review: [],
    text: TEXT,
    taskIndex: 1,
    tips: [{ en: 'Cover all points.', de: 'Behandle alle Punkte.' }, { en: 'Tip 2.', de: 'Tipp 2.' }, { en: 'Tip 3.', de: 'Tipp 3.' }],
    letter: {
      marks: [{ start: TEXT.indexOf('mit mein Zimmer'), end: TEXT.indexOf('mit mein Zimmer') + 15, original: 'mit mein Zimmer', correction: 'mit meinem Zimmer', type: 'grammar', category: 'case', reason: { en: 'Dative.', de: 'Dativ.' } }],
      criteria: [
        { id: 'aufgabe', grade: 'B', justification: { en: 'One point thin.', de: 'Ein Punkt knapp.' } },
        { id: 'gestaltung', grade: 'B', justification: { en: 'Fine.', de: 'Gut.' } },
        { id: 'richtigkeit', grade: 'C', justification: { en: 'Errors.', de: 'Fehler.' } },
      ],
      points: 25,
      maxPoints: 45,
      percent: 56,
      corrected: 'Sehr geehrte Damen und Herren, ich habe ein Problem mit meinem Zimmer.',
      summary: { en: 'A fair letter.', de: 'Ein ordentlicher Brief.' },
    },
  };

  afterEach(() => {
    push.mockClear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the letter result without Ask about this, and copies the letter into free writing', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => delayedResponse({ id: 1, mode: 'free_writing' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<TeilReview result={LETTER_RESULT as never} run={LETTER_RUN as never} />);
    expect(screen.getByText('25 of 45 points (56%)')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Task completion' })).toHaveTextContent('Grade B');
    expect(screen.getByText('Tip: Cover all points.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mit mein Zimmer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask about this' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy into free writing' }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/freestyle/free_writing?draft=1'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/freestyle/free_writing/session');
    const body = JSON.parse(init!.body as string);
    // S11: the prompt is the chosen task's situation, cut to the Freestyle setup limit of 200 characters.
    expect(body.level).toBe('B1');
    expect(body.setup.prompt.length).toBeLessThanOrEqual(200);
    expect(SITUATION.startsWith(body.setup.prompt.replace(/…$/, ''))).toBe(true);
    expect(sessionStorage.getItem('nadoch.writingDraft')).toBe(TEXT);
  });

  it('shows the error and stays when free writing cannot be opened', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ error: 'x', code: 'level_locked', params: { level: 'B1' } }, { ok: false, status: 403 })));
    renderWithIntl(<TeilReview result={LETTER_RESULT as never} run={LETTER_RUN as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy into free writing' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('nadoch.writingDraft')).toBeNull();
  });

  it('has no copy button inside a mock', () => {
    renderWithIntl(<TeilReview result={LETTER_RESULT as never} run={{ ...LETTER_RUN, mockId: 'm1' } as never} />);
    expect(screen.getByText('25 of 45 points (56%)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy into free writing' })).toBeNull();
  });
});
