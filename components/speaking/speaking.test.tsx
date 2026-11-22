import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { axe, expectNoViolations } from '@/test/axe';
import { ShellProvider } from '@/components/shell/ShellContext';
import type { PracticeResult, PracticeRun, SpokenTurnView } from '@/lib/exam/practiceViews';
import type { WritingRubric } from '@/lib/writing/rubric';
import { SpokenPartRunner } from './SpokenPartRunner';
import { SpokenResult } from './SpokenResult';

const crit = (id: string, en: string) => ({ id, name: { en, de: en }, points: { A: 10, B: 6, C: 2, D: 0 }, descriptors: { A: 'a', B: 'b', C: 'c', D: 'd' } });
const RUBRIC: WritingRubric = { criteria: [crit('aufgabe', 'Task completion'), crit('sprache', 'Language'), crit('aussprache', 'Pronunciation and intonation')] };
const SET = {
  situation: 'Elena zieht nach Hamburg.',
  materials: [{ title: 'Abschiedsfeier planen', points: ['Wann?', 'Wo?'] }],
  examinerIntro: 'Guten Tag. Bitte beginnen Sie.',
  partner: { name: 'Jonas', gender: 'm' as const, profile: 'Kursteilnehmer' },
  turns: 2,
};
const INTRO: SpokenTurnView = { speaker: 'examiner', text: 'Guten Tag. Bitte beginnen Sie.', clipId: 'intro', audio: true };
const RUN: PracticeRun = {
  attemptId: 7,
  formatId: 'telc-b1',
  part: { id: 'sprechen-3', skill: 'speaking', title: { en: 'Speaking Part 3', de: 'Mündlicher Ausdruck Teil 3' }, taskType: 'spoken', items: 3, points: 30, minutes: 6, instructions: 'Gemeinsam etwas planen.', rubric: RUBRIC },
  set: { id: 's1', view: SET },
  minutes: 6,
  startedAt: new Date().toISOString(),
  mockId: null,
  spoken: { set: SET, turns: [INTRO], state: 'student' },
};
const STUDENT: SpokenTurnView = { speaker: 'student', text: 'Ich gehe gestern einkaufen', clipId: 'c1', audio: true };
const PARTNER: SpokenTurnView = { speaker: 'partner', text: 'Samstag passt mir besser.', clipId: 'p1', audio: false };

const GRADE = {
  criteria: [
    { id: 'aufgabe', grade: 'B' as const, justification: { en: 'Good plan.', de: 'Guter Plan.' } },
    { id: 'sprache', grade: 'C' as const, justification: { en: 'Some errors.', de: 'Einige Fehler.' } },
    { id: 'aussprache', grade: 'B' as const, justification: { en: 'Clear.', de: 'Deutlich.' } },
  ],
  points: 14,
  maxPoints: 30,
  percent: 47,
  marks: [{ start: 4, end: 16, original: 'gehe gestern', correction: 'bin gestern gegangen', type: 'grammar' as const, category: 'perfect_auxiliary', reason: { en: 'Past.', de: 'Vergangenheit.' }, turnIndex: 1 }],
  pronunciation: { en: 'Mostly clear speech.', de: 'Meist deutlich.' },
  summary: { en: 'A solid plan.', de: 'Ein solider Plan.' },
  estimate: { score: 75, unclear: ['einkaufen'] },
};
const RESULT: PracticeResult = { attemptId: 7, score: 14, maxScore: 30, overtimeSeconds: 0, review: [], tips: [], spoken: { grade: GRADE, turns: [INTRO, STUDENT, PARTNER] } };

class FakeRecorder {
  static isTypeSupported = () => true;
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(['abc'], { type: this.mimeType }) });
      this.onstop?.();
    }, 0);
  }
}

function mockMicrophone() {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
}

async function record() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start speaking' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop and send' }));
}

// Routes the runner's requests by URL, in call order per URL.
function stubFetch(routes: Record<string, (() => Promise<unknown>)[]>) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const next = key ? routes[key].shift() : undefined;
    return (next ? next() : delayedResponse({})) as Promise<Response>;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const bodyOf = (fetchMock: ReturnType<typeof stubFetch>, url: string) =>
  fetchMock.mock.calls.filter(([u]) => u === url).map(([, init]) => JSON.parse((init as RequestInit).body as string));

let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
beforeEach(() => {
  play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderRunner(run: PracticeRun = RUN) {
  const onFinished = vi.fn();
  const view = renderWithIntl(
    <ShellProvider>
      <SpokenPartRunner run={run} onFinished={onFinished} />
    </ShellProvider>
  );
  return { onFinished, ...view };
}

describe('SpokenPartRunner', () => {
  it('shows the task sheet and the intro, appends turns after each recording, and finishes', async () => {
    mockMicrophone();
    const fetchMock = stubFetch({
      '/api/speech/transcribe': [() => delayedResponse({ clipId: 'c1', text: STUDENT.text, words: [], duration: 2 })],
      '/api/exam-practice/spoken/turn': [() => delayedResponse({ turns: [INTRO, STUDENT, PARTNER], state: 'student' })],
      '/api/exam-practice/spoken/finish': [() => delayedResponse(RESULT)],
    });
    const { onFinished } = renderRunner();
    const sheet = screen.getByRole('region', { name: 'Task sheet' });
    expect(within(sheet).getByText('Elena zieht nach Hamburg.')).toBeInTheDocument();
    expect(within(sheet).getByText('Abschiedsfeier planen')).toBeInTheDocument();
    expect(within(sheet).getByText('Wo?')).toBeInTheDocument();
    expect(within(sheet).getByText('Your partner: Jonas')).toBeInTheDocument();

    const conversation = screen.getByRole('region', { name: 'Conversation' });
    expect(within(conversation).getByText(INTRO.text)).toBeInTheDocument();
    // Minor 5: each play button names its line and speaker.
    expect(within(conversation).getByRole('button', { name: 'Play line 1 (Examiner)' })).toBeInTheDocument();
    // The intro plays as it arrives.
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByText('Your turn: tap the microphone and speak.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();

    await record();
    expect(await within(conversation).findByText(PARTNER.text)).toBeInTheDocument();
    expect(within(conversation).getByText(STUDENT.text)).toBeInTheDocument();
    // B3: a line without audio says so.
    expect(within(conversation).getByText('Audio unavailable right now')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/speech/transcribe?scope=teil%3A7');
    expect(bodyOf(fetchMock, '/api/exam-practice/spoken/turn')).toEqual([{ attemptId: 7, clipId: 'c1' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(RESULT));
    expect(bodyOf(fetchMock, '/api/exam-practice/spoken/finish')).toEqual([{ attemptId: 7 }]);
  });

  it('finishes on its own once the examiner closes the conversation', async () => {
    mockMicrophone();
    const closing: SpokenTurnView = { speaker: 'examiner', text: "Vielen Dank, das war's.", clipId: 'x', audio: true };
    stubFetch({
      '/api/speech/transcribe': [() => delayedResponse({ clipId: 'c1', text: STUDENT.text, words: [], duration: 2 })],
      '/api/exam-practice/spoken/turn': [() => delayedResponse({ turns: [INTRO, STUDENT, closing], state: 'closing' })],
      '/api/exam-practice/spoken/finish': [() => delayedResponse(RESULT)],
    });
    const { onFinished } = renderRunner();
    await record();
    expect(await screen.findByText("Vielen Dank, das war's.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start speaking' })).not.toBeInTheDocument();
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(RESULT));
  });

  it('keeps the conversation and offers Finish again when grading fails', async () => {
    mockMicrophone();
    stubFetch({
      '/api/speech/transcribe': [() => delayedResponse({ clipId: 'c1', text: STUDENT.text, words: [], duration: 2 })],
      '/api/exam-practice/spoken/turn': [() => delayedResponse({ turns: [INTRO, STUDENT, PARTNER], state: 'student' })],
      '/api/exam-practice/spoken/finish': [
        () => delayedResponse({ error: 'This conversation is being graded', code: 'spoken_grading' }, { ok: false, status: 409 }),
        () => delayedResponse(RESULT),
      ],
    });
    const { onFinished } = renderRunner();
    await record();
    await screen.findByText(PARTNER.text);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This conversation is being graded.');
    expect(screen.getByText(STUDENT.text)).toBeInTheDocument();
    // Fix round 1 (I2): Finish closed the conversation; only grading can be retried, no more turns.
    expect(screen.queryByRole('button', { name: 'Start speaking' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your turn: tap the microphone and speak.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(RESULT));
  });

  it('shows a failed turn with Try again, which resends the same recording', async () => {
    mockMicrophone();
    const fetchMock = stubFetch({
      '/api/speech/transcribe': [() => delayedResponse({ clipId: 'c1', text: STUDENT.text, words: [], duration: 2 })],
      '/api/exam-practice/spoken/turn': [
        () => delayedResponse({ error: 'AI down', code: 'ai_failed' }, { ok: false, status: 502 }),
        () => delayedResponse({ turns: [INTRO, STUDENT, PARTNER], state: 'student' }),
      ],
    });
    renderRunner();
    await record();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(PARTNER.text)).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/api/exam-practice/spoken/turn')).toEqual([{ attemptId: 7, clipId: 'c1' }, { attemptId: 7, clipId: 'c1' }]);
  });

  it('has no axe violations', async () => {
    stubFetch({});
    const { container } = renderRunner();
    await expectNoViolations(await axe(container));
  });
});

describe('SpokenResult', () => {
  it('renders the criteria, the marked student turns and the pronunciation box, and deletes the scope on unmount', async () => {
    const fetchMock = stubFetch({});
    // Its own attempt id: an earlier test's runner deletes teil:7 a tick after it unmounts.
    const { unmount, container } = renderWithIntl(<SpokenResult result={RESULT} rubric={RUBRIC} attemptId={8} />);
    const deletes = () => fetchMock.mock.calls.filter(([url]) => url === '/api/speech/scope?scope=teil%3A8');
    expect(screen.getByText('14 of 30 points (47%)')).toBeInTheDocument();
    for (const name of ['Task completion', 'Language', 'Pronunciation and intonation']) expect(screen.getByRole('listitem', { name })).toBeInTheDocument();
    // The mark sits on the student's turn, not on the partner's.
    expect(screen.getByRole('button', { name: 'gehe gestern' })).toBeInTheDocument();
    expect(screen.getByText(PARTNER.text)).toBeInTheDocument();
    expect(screen.getByText('Pronunciation (estimate)')).toBeInTheDocument();
    expect(screen.getByText('Mostly clear')).toBeInTheDocument();
    expect(screen.getByText('Mostly clear speech.')).toBeInTheDocument();
    expect(screen.getByText('A solid plan.')).toBeInTheDocument();
    await expectNoViolations(await axe(container));

    expect(deletes()).toEqual([]);
    unmount();
    await waitFor(() => expect(deletes()).toEqual([['/api/speech/scope?scope=teil%3A8', expect.objectContaining({ method: 'DELETE' })]]));
  });

  it('says the conversation was deleted when only the stored grade is left', () => {
    stubFetch({});
    const stored: PracticeResult = { ...RESULT, spoken: { grade: { ...GRADE, marks: [], estimate: { score: 75, unclear: [] } }, turns: [] } };
    renderWithIntl(<SpokenResult result={stored} rubric={RUBRIC} attemptId={7} />);
    expect(screen.getByText('The conversation has been deleted; only the grades are kept.')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Language' })).toBeInTheDocument();
  });
});
