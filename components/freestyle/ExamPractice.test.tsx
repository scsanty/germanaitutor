import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ShellProvider } from '@/components/shell/ShellContext';
import { axe, expectNoViolations } from '@/test/axe';
import { ExamPractice } from './ExamPractice';

const LESEN_1 = {
  id: 'lesen-1',
  skill: 'reading',
  title: { en: 'Reading Part 1', de: 'Leseverstehen Teil 1' },
  taskType: 'matching',
  items: 2,
  points: 25,
  minutes: 20,
  instructions: 'Lesen Sie …',
};
const HOEREN_1 = {
  id: 'hoeren-1',
  skill: 'listening',
  title: { en: 'Listening Part 1', de: 'Hörverstehen Teil 1' },
  taskType: 'audio_questions',
  items: 5,
  points: 25,
  minutes: 10,
  instructions: 'Hören Sie …',
};
const OVERVIEW = {
  format: {
    id: 'telc-b1',
    track: 'telc',
    level: 'B1',
    name: 'telc Deutsch B1',
    sources: [],
    blocks: [{ id: 'written', title: { en: 'Written exam', de: 'Schriftliche Prüfung' }, minutes: 30, partIds: ['lesen-1', 'hoeren-1'], passRatio: 0.6 }],
    parts: [LESEN_1, HOEREN_1],
  },
  parts: [
    { part: LESEN_1, runnable: true, mockOnly: false, audioUnavailable: false, lastPercent: 80 },
    { part: HOEREN_1, runnable: false, mockOnly: false, audioUnavailable: false, lastPercent: null },
  ],
  mockRunnable: true,
};

const RUN = {
  attemptId: 3,
  formatId: 'telc-b1',
  part: LESEN_1,
  set: { id: 's1', view: { items: ['Ein Hund', 'Eine Katze'], targets: ['Text über Hunde', 'Text über Katzen'], allowNone: false } },
  minutes: 20,
  startedAt: new Date().toISOString(),
  mockId: null,
};

function stubFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) => delayedResponse(routes[url] ?? { error: 'x', code: 'not_found' }, { ok: url in routes, status: url in routes ? 200 : 404 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPractice() {
  return renderWithIntl(
    <ShellProvider>
      <ExamPractice />
    </ShellProvider>
  );
}

describe('ExamPractice', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a card per part, with Practise only for runnable parts', async () => {
    stubFetch({ '/api/exam-practice': OVERVIEW });
    renderPractice();
    const lesen = (await screen.findByText('Leseverstehen Teil 1')).closest('[data-slot="card"]') as HTMLElement;
    const hoeren = screen.getByText('Hörverstehen Teil 1').closest('[data-slot="card"]') as HTMLElement;
    expect(lesen.querySelector('button')).toBeEnabled();
    // Every card's button says "Practise"; the part title tells them apart.
    expect(lesen.querySelector('button')).toHaveAccessibleDescription('Leseverstehen Teil 1');
    expect(hoeren).toHaveTextContent('Coming with the Listening module');
    expect(hoeren.querySelector('button')).toBeDisabled();
  });

  it('says when a listening part or the mock cannot be heard right now', async () => {
    stubFetch({
      '/api/exam-practice': {
        ...OVERVIEW,
        parts: [OVERVIEW.parts[0], { ...OVERVIEW.parts[1], audioUnavailable: true }],
        mockRunnable: false,
      },
    });
    renderPractice();
    const hoeren = (await screen.findByText('Hörverstehen Teil 1')).closest('[data-slot="card"]') as HTMLElement;
    expect(hoeren).toHaveTextContent('Audio unavailable right now');
    expect(hoeren.querySelector('button')).toBeDisabled();
    expect(screen.getByText("The full mock needs listening audio that isn't available right now.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full mock' })).toBeDisabled();
  });

  it('starts a part and shows the runner with its timer', async () => {
    const fetchMock = stubFetch({ '/api/exam-practice': OVERVIEW, '/api/exam-practice/start': RUN });
    renderPractice();
    const lesen = (await screen.findByText('Leseverstehen Teil 1')).closest('[data-slot="card"]') as HTMLElement;
    fireEvent.click(lesen.querySelector('button')!);
    expect(await screen.findByText('20:00')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/exam-practice/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ formatId: 'telc-b1', partId: 'lesen-1' }),
    }));
  });

  it('starts once on a double click (S20)', async () => {
    const fetchMock = stubFetch({ '/api/exam-practice': OVERVIEW, '/api/exam-practice/start': RUN });
    renderPractice();
    const button = ((await screen.findByText('Leseverstehen Teil 1')).closest('[data-slot="card"]') as HTMLElement).querySelector('button')!;
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('20:00');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/exam-practice/start')).toHaveLength(1);
  });

  it('runs a full mock under one clock and shows the result against the pass ratio', async () => {
    const second = { ...RUN, attemptId: 4, part: { ...LESEN_1, id: 'lesen-2', title: { en: 'Reading Part 2', de: 'Leseverstehen Teil 2' } } };
    const mock = { mockId: 'm1', minutes: 40, runs: [RUN, second] };
    const review = [
      { index: 0, answerText: 'Text über Hunde', right: true, correct: 'Text über Hunde', explanation: { en: 'Dogs.', de: 'Hunde.' } },
      { index: 1, answerText: '', right: false, correct: 'Text über Katzen', explanation: { en: 'Cats.', de: 'Katzen.' } },
    ];
    const results = [
      { attemptId: 3, score: 20, maxScore: 25, overtimeSeconds: 0, review },
      { attemptId: 4, score: 10, maxScore: 25, overtimeSeconds: 0, review },
    ];
    let submits = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/exam-practice') return delayedResponse(OVERVIEW);
      if (url === '/api/exam-practice/mock/start') return delayedResponse(mock);
      return delayedResponse(results[submits++]);
    }));
    const { container } = renderPractice();
    fireEvent.click(await screen.findByRole('button', { name: 'Full mock' }));
    expect(await screen.findByText('40:00')).toBeInTheDocument();
    expect(screen.getByText('Part 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Leseverstehen Teil 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { name: 'Leseverstehen Teil 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Written exam: 30 of 50 points — passed')).toBeInTheDocument();
    expect(screen.getByText('Leseverstehen Teil 1: 20 of 25 points')).toBeInTheDocument();
    // One review per part is in the DOM: their heading ids must not collide.
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = [...container.querySelectorAll('section[aria-labelledby]')];
    expect(sections.length).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
    expectNoViolations(await axe(container));
  });

  // S17 + NEEDS_USER5: a spoken part needs the speech service; AI-graded parts warn when no provider is set up.
  it('says when a spoken part needs the speech service, and warns on AI-graded parts without a provider', async () => {
    const SPRECHEN = { id: 'sprechen-3', skill: 'speaking', title: { en: 'Speaking Part 3', de: 'Mündlicher Ausdruck Teil 3' }, taskType: 'spoken', items: 3, points: 30, minutes: 6, instructions: 'Planen …' };
    stubFetch({
      '/api/exam-practice': {
        ...OVERVIEW,
        format: { ...OVERVIEW.format, parts: [LESEN_1, SPRECHEN] },
        parts: [{ ...OVERVIEW.parts[0], speechUnavailable: false }, { part: SPRECHEN, runnable: false, mockOnly: false, audioUnavailable: false, speechUnavailable: true, lastPercent: null }],
        aiReady: false,
      },
    });
    renderPractice();
    const sprechen = (await screen.findByText('Mündlicher Ausdruck Teil 3')).closest('[data-slot="card"]') as HTMLElement;
    expect(sprechen).toHaveTextContent("Needs the speech service, which isn't available right now");
    expect(sprechen).toHaveTextContent('Graded by AI: no AI provider is set up yet');
    expect(sprechen.querySelector('button')).toBeDisabled();
    const lesen = screen.getByText('Leseverstehen Teil 1').closest('[data-slot="card"]') as HTMLElement;
    expect(lesen).not.toHaveTextContent('Graded by AI');
  });

  // B4: after the written block's result, the oral block starts on demand and gets its own result.
  it('offers the oral part after the written mock and shows its own block result', async () => {
    const RUBRIC = { criteria: [{ id: 'aufgabe', name: { en: 'Task completion', de: 'Aufgabenbewältigung' }, points: { A: 30, B: 18, C: 6, D: 0 }, descriptors: { A: 'a', B: 'b', C: 'c', D: 'd' } }] };
    const SPRECHEN = { id: 'sprechen-3', skill: 'speaking', title: { en: 'Speaking Part 3', de: 'Mündlicher Ausdruck Teil 3' }, taskType: 'spoken', items: 1, points: 30, minutes: 6, instructions: 'Planen …', rubric: RUBRIC };
    const SET = { situation: 'Elena zieht weg.', materials: [], examinerIntro: 'Guten Tag.', partner: { name: 'Jonas', gender: 'm', profile: 'p' }, turns: 4 };
    const turns = [
      { speaker: 'examiner', text: 'Guten Tag.', clipId: 'i', audio: false },
      { speaker: 'student', text: 'Hallo Jonas.', clipId: 'c', audio: true },
      { speaker: 'partner', text: 'Hallo!', clipId: 'p', audio: false },
    ];
    const oralRun = { attemptId: 9, formatId: 'telc-b1', part: SPRECHEN, set: { id: 's9', view: SET }, minutes: 6, startedAt: new Date().toISOString(), mockId: 'm1', spoken: { set: SET, turns, state: 'student' } };
    const format = {
      ...OVERVIEW.format,
      blocks: [...OVERVIEW.format.blocks, { id: 'oral', title: { en: 'Oral exam', de: 'Mündliche Prüfung' }, minutes: 6, partIds: ['sprechen-3'], passRatio: 0.6 }],
      parts: [LESEN_1, HOEREN_1, SPRECHEN],
    };
    const grade = { criteria: [{ id: 'aufgabe', grade: 'A', justification: { en: 'Great.', de: 'Toll.' } }], points: 30, maxPoints: 30, percent: 100, marks: [], pronunciation: null, summary: { en: 'Well done.', de: 'Gut gemacht.' }, estimate: null };
    const routes: Record<string, unknown> = {
      '/api/exam-practice': { ...OVERVIEW, format, aiReady: true },
      '/api/exam-practice/mock/start': { mockId: 'm1', minutes: 20, runs: [RUN], oral: { partIds: ['sprechen-3'], runnable: true } },
      '/api/exam-practice/submit': { attemptId: 3, score: 20, maxScore: 25, overtimeSeconds: 0, review: [] },
      '/api/exam-practice/mock/oral': { mockId: 'm1', runs: [oralRun] },
      '/api/exam-practice/spoken/finish': { attemptId: 9, score: 30, maxScore: 30, overtimeSeconds: 0, review: [], tips: [], spoken: { grade, turns } },
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const fetchMock = stubFetch(routes);
    renderPractice();
    fireEvent.click(await screen.findByRole('button', { name: 'Full mock' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Written exam: 20 of 25 points — passed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the oral part' }));
    expect(await screen.findByRole('heading', { name: 'Mündlicher Ausdruck Teil 3' })).toBeInTheDocument();
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/exam-practice/mock/oral', expect.objectContaining({ body: JSON.stringify({ mockId: 'm1' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Oral exam: 30 of 30 points — passed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start the oral part' })).not.toBeInTheDocument();
  });

  it('says so when the track and level have no format', async () => {
    stubFetch({ '/api/exam-practice': { format: null, parts: [] } });
    renderPractice();
    expect(await screen.findByText("There's no exam format for this track and level yet.")).toBeInTheDocument();
  });
});
