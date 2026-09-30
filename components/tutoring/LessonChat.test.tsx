import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { CHAT_MESSAGE_MAX_LENGTH } from '@/lib/tutoring/lessonChat';
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
    const props = renderChat({ askAbout: { kind: 'exercise', exerciseId: 'ex1', label: 'exercise 1' } });

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
    // The context stays attached for follow-up questions (Phase 2).
    expect(props.onClearAskAbout).not.toHaveBeenCalled();
    expect(screen.getByText('Asking about exercise 1')).toBeInTheDocument();
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

  // M-8: the server rejects messages over CHAT_MESSAGE_MAX_LENGTH with an English 400; cap the
  // textarea client-side so the student sees it before sending.
  it('caps the message textarea at the server limit', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: true }) });
    renderChat();
    expect(await screen.findByLabelText('Your message')).toHaveAttribute(
      'maxLength',
      String(CHAT_MESSAGE_MAX_LENGTH)
    );
  });

  it('labels who wrote each message', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({ messages: [EARLIER, REPLY], aiAvailable: true }) });
    renderChat();
    expect(await screen.findByText('Hello.')).toBeInTheDocument();
    expect(screen.getByText('You:')).toBeInTheDocument();
    expect(screen.getByText('Tutor:')).toBeInTheDocument();
  });

  it('sends a practice exercise’s answer with each message', async () => {
    const fetchMock = stubFetch({
      [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: true }),
      [`POST ${URL}`]: () => delayedResponse({ messages: [] }),
    });
    renderChat({
      askAbout: { kind: 'practice', practiceExerciseId: 'px-1', answerText: 'Hallo', result: 'wrong', label: 'a practice exercise' },
    });
    expect(await screen.findByText('Ask anything about this lesson.')).toBeInTheDocument();
    expect(screen.getByText('Asking about a practice exercise')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Warum?', practiceExerciseId: 'px-1', practiceAnswer: { answerText: 'Hallo', result: 'wrong' } }),
      })
    );
  });

  it('tries loading again after a failed load when the panel is reopened', async () => {
    const responses = [
      () => delayedResponse({}, { ok: false, status: 500 }),
      () => delayedResponse({ messages: [EARLIER], aiAvailable: true }),
    ];
    stubFetch({ [`GET ${URL}`]: () => responses.shift()!() });
    const props = { lessonId: 'a1-greet', onToggle: vi.fn(), askAbout: null, onClearAskAbout: vi.fn() };
    const { rerender } = renderWithIntl(<LessonChat {...props} open />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the chat.');
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LessonChat {...props} open={false} />
      </NextIntlClientProvider>
    );
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LessonChat {...props} open />
      </NextIntlClientProvider>
    );
    expect(await screen.findByText('Was heißt Hallo?')).toBeInTheDocument();
  });
});
