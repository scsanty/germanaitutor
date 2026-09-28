import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { LessonChat } from './LessonChat';

const URL = '/api/tutoring/lessons/a1-greet/chat';
const EARLIER = { id: 1, role: 'user', content: 'Was heißt Hallo?', exerciseId: null, createdAt: '2026-09-24T09:00:00.000Z' };
const REPLY = { id: 2, role: 'assistant', content: 'Hello.', exerciseId: null, createdAt: '2026-09-24T09:00:00.000Z' };

function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderChat(props: Partial<Parameters<typeof LessonChat>[0]> = {}) {
  const all = { lessonId: 'a1-greet', open: true, onToggle: vi.fn(), askAbout: null, onClearAskAbout: vi.fn(), ...props };
  renderWithIntl(<LessonChat {...all} />);
  return all;
}

describe('LessonChat', () => {
  it('stays closed and loads nothing until opened', () => {
    const fetchMock = stubFetch({});
    const props = renderChat({ open: false });
    fireEvent.click(screen.getByRole('button', { name: 'Ask the AI tutor' }));
    expect(props.onToggle).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the thread and sends a question about an exercise', async () => {
    const fetchMock = stubFetch({
      [`GET ${URL}`]: () => delayedResponse({ messages: [EARLIER], aiAvailable: true }),
      [`POST ${URL}`]: () =>
        delayedResponse({
          messages: [
            { id: 3, role: 'user', content: 'Warum?', exerciseId: 'ex1', createdAt: 'x' },
            { id: 4, role: 'assistant', content: 'Weil…', exerciseId: 'ex1', createdAt: 'x' },
          ],
        }),
    });
    const props = renderChat({ askAbout: { exerciseId: 'ex1', label: 'exercise 1' } });

    expect(await screen.findByText('Was heißt Hallo?')).toBeInTheDocument();
    expect(screen.getByText('Asking about exercise 1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Weil…')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Warum?', exerciseId: 'ex1' }),
    });
    expect(screen.getByLabelText('Your message')).toHaveValue('');
    expect(props.onClearAskAbout).toHaveBeenCalled();
  });

  it('is disabled with a Settings link when no AI provider works', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: false }) });
    renderChat();
    expect(await screen.findByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByLabelText('Your message')).toBeDisabled();
  });

  it('keeps the message and shows a Settings link when the AI fails', async () => {
    stubFetch({
      [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: true }),
      [`POST ${URL}`]: () => delayedResponse({ error: 'Anthropic returned 429' }, { ok: false, status: 502 }),
    });
    renderChat();
    expect(await screen.findByText('Ask anything about this lesson.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hallo?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI tutor could not answer: Anthropic returned 429.');
    expect(screen.getByLabelText('Your message')).toHaveValue('Hallo?');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled());
  });

  it('shows an error when the thread cannot load', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({}, { ok: false, status: 500 }) });
    renderChat();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the chat.');
  });

  it('labels who wrote each message', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({ messages: [EARLIER, REPLY], aiAvailable: true }) });
    renderChat();
    expect(await screen.findByText('Hello.')).toBeInTheDocument();
    expect(screen.getByText('You:')).toBeInTheDocument();
    expect(screen.getByText('Tutor:')).toBeInTheDocument();
  });
});
