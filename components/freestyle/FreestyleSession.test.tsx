import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { FreestyleSession } from './FreestyleSession';

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

afterEach(() => vi.unstubAllGlobals());

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
    stubFetch({ 'GET /api/freestyle/conversation/session': { body: { error: 'boom' }, ok: false, status: 500 } });
    renderWithIntl(<FreestyleSession mode="conversation" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Freestyle. Please reload the page.');
  });
});
