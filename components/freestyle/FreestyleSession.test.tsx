import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { FreestyleSession } from './FreestyleSession';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

type Reply = { body: unknown; ok?: boolean; status?: number };

// Routes fetch by "METHOD url"; unmatched calls fail the test loudly.
function stubFetch(routes: Record<string, Reply | ((init?: RequestInit) => Reply)>) {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected fetch: ${key}`);
    const reply = typeof route === 'function' ? route(init) : route;
    return delayedResponse(reply.body, { ok: reply.ok, status: reply.status });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const OVERVIEW = { modes: [], aiAvailable: true, levels: ['A1', 'A2'], activeLevel: 'A2' };

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('FreestyleSession', () => {
  it('shows the setup when no session is open, with topics for the active level, refetched when the level changes', async () => {
    const fetchMock = stubFetch({
      'GET /api/freestyle/grammar_drill/session': { body: { session: null } },
      'GET /api/freestyle': { body: OVERVIEW },
      'GET /api/freestyle/topics?level=A2': { body: { grammarTopics: ['Perfekt mit sein'] } },
      'GET /api/freestyle/topics?level=A1': { body: { grammarTopics: ['Das Verb sein'] } },
    });
    renderWithIntl(<FreestyleSession mode="grammar_drill" />);
    expect(await screen.findByRole('radio', { name: 'Perfekt mit sein' })).toBeInTheDocument();
    expect(screen.getByLabelText('Level')).toHaveValue('A2');
    expect(screen.getByRole('heading', { name: 'Grammar drill' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'A1' } });
    expect(await screen.findByRole('radio', { name: 'Das Verb sein' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Perfekt mit sein' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/freestyle/topics?level=A1');
  });

  it('shows the thread and the level of an open conversation, without fetching the setup data', async () => {
    const fetchMock = stubFetch({
      'GET /api/freestyle/conversation/session': {
        body: {
          session: {
            mode: 'conversation',
            level: 'B1',
            setup: {},
            messages: [{ id: 1, role: 'assistant', content: 'Wie war dein Wochenende?', extra: null }],
          },
        },
      },
    });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    expect(await screen.findByRole('button', { name: 'Wochenende' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeInTheDocument();
    expect(screen.getByText('B1')).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('appends the new turn after a send, and shows the catalog text when a send fails', async () => {
    let failNext = true;
    stubFetch({
      'GET /api/freestyle/conversation/session': {
        body: { session: { mode: 'conversation', level: 'A1', setup: {}, messages: [] } },
      },
      'POST /api/freestyle/conversation/message': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ text: 'Hallo!' });
        if (failNext) {
          failNext = false;
          return { body: { error: 'Model said: blah', code: 'ai_bad_reply' }, ok: false, status: 502 };
        }
        return {
          body: {
            messages: [
              { id: 1, role: 'user', content: 'Hallo!', extra: { corrections: [] } },
              { id: 2, role: 'assistant', content: 'Hallo! Wie geht es dir?', extra: null },
            ],
          },
        };
      },
    });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    const box = await screen.findByLabelText('Your message');
    fireEvent.change(box, { target: { value: 'Hallo!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI replied in an unexpected format');
    expect(box).toHaveValue('Hallo!');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('button', { name: 'geht' })).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('shows an alert when the session cannot be loaded', async () => {
    stubFetch({ 'GET /api/freestyle/conversation/session': { body: {}, ok: false, status: 500 } });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Freestyle. Please reload the page.');
  });

  it('shows the catalog text for a coded load error', async () => {
    stubFetch({ 'GET /api/freestyle/conversation/session': { body: { error: 'x', code: 'ai_bad_reply' }, ok: false, status: 502 } });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI replied in an unexpected format');
  });

  it('shows the reading screen of an open free-reading session and swaps in another article', async () => {
    const article = (title: string) => ({ title, text: 'Der Zug fährt.', questions: [{ question: 'Was fährt?', options: ['Der Zug', 'Das Auto'], correctIndex: 0 }] });
    const open = { mode: 'free_reading', level: 'A2', setup: { topic: 'Bahn', article: article('Bahnfahren') }, messages: [] };
    stubFetch({
      'GET /api/freestyle/free_reading/session': { body: { session: open } },
      'POST /api/freestyle/free_reading/article': { body: { ...open, setup: { topic: 'Bahn', article: article('Neue Strecke') } } },
    });
    renderWithIntl(<FreestyleSession mode="free_reading" />);
    expect(await screen.findByRole('heading', { name: 'Bahnfahren' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Another article' }));
    expect(await screen.findByRole('heading', { name: 'Neue Strecke' })).toBeInTheDocument();
  });

  it('adds a submitted text to an open free-writing session as a new version', async () => {
    stubFetch({
      'GET /api/freestyle/free_writing/session': { body: { session: { mode: 'free_writing', level: 'B1', setup: { prompt: '' }, messages: [] } } },
      'POST /api/freestyle/free_writing/message': {
        body: {
          messages: [
            { id: 1, role: 'user', content: 'Ich gehe.', extra: null },
            { id: 2, role: 'assistant', content: 'Ich gehe heim.', extra: { corrections: [], comment: { en: 'Good.', de: 'Gut.' } } },
          ],
        },
      },
    });
    renderWithIntl(<FreestyleSession mode="free_writing" />);
    fireEvent.change(await screen.findByLabelText('Your text'), { target: { value: 'Ich gehe.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { name: 'Version 1' })).toBeInTheDocument();
    expect(screen.getByTestId('corrected')).toHaveTextContent('Ich gehe heim.');
  });
  it('ends an open session from the header and goes back to the hub', async () => {
    stubFetch({
      'GET /api/freestyle/conversation/session': {
        body: { session: { mode: 'conversation', level: 'A1', setup: {}, messages: [] } },
      },
      'POST /api/freestyle/conversation/end': { body: { summary: { wentWell: [{ en: 'Good questions', de: 'Gute Fragen' }], mistakes: [], words: [] } } },
    });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    fireEvent.click(await screen.findByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(await screen.findByText('Good questions')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(push).toHaveBeenCalledWith('/freestyle');
  });

  it('shows no End button before a session is started', async () => {
    stubFetch({
      'GET /api/freestyle/conversation/session': { body: { session: null } },
      'GET /api/freestyle': { body: OVERVIEW },
    });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End' })).not.toBeInTheDocument();
  });
});
