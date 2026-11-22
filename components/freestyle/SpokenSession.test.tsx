import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { axe, expectNoViolations } from '@/test/axe';
import type { SessionMessage, SessionView } from '@/lib/freestyle/sessionViews';
import { SpokenSession } from './SpokenSession';

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

// Replies are tappable word by word, so a reply is matched by its whole text.
const reply = (text: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === text;

const SESSION: SessionView = {
  mode: 'spoken',
  level: 'B1',
  setup: {},
  messages: [{ id: 1, role: 'assistant', content: 'Hallo! Worüber sprechen wir?', extra: null }],
};
const ADDED: SessionMessage[] = [
  {
    id: 2,
    role: 'user',
    content: 'Ich habe gegangen zum Arzt.',
    extra: { clipId: 'c1', corrections: [{ wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', category: 'perfect_auxiliary', reason: { en: 'gehen takes sein', de: 'gehen mit sein' } }] },
  },
  { id: 3, role: 'assistant', content: 'Wohin bist du gegangen?', extra: { clipId: 'r1', audio: true } },
];

let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
beforeEach(() => {
  play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function record() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start speaking' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop and send' }));
}

describe('SpokenSession', () => {
  it('records, shows the transcript with its corrections, then the reply text with its audio playing', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.startsWith('/api/speech/transcribe')) return delayedResponse({ clipId: 'c1', text: 'Ich habe gegangen zum Arzt.', words: [], duration: 2 });
      if (url === '/api/freestyle/spoken/message') return delayedResponse({ messages: ADDED });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onMessages = vi.fn();
    const { rerender } = renderWithIntl(<SpokenSession session={SESSION} onMessages={onMessages} />);
    expect(screen.getByText(reply('Hallo! Worüber sprechen wir?'))).toBeInTheDocument();
    await record();
    await waitFor(() => expect(onMessages).toHaveBeenCalledWith(ADDED));
    const message = fetchMock.mock.calls.find(([u]) => u === '/api/freestyle/spoken/message')!;
    expect(JSON.parse((message[1] as RequestInit).body as string)).toEqual({ clipId: 'c1' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/speech/transcribe?scope=freestyle%3Aspoken');

    rerender(<SpokenSession session={{ ...SESSION, messages: [...SESSION.messages, ...ADDED] }} onMessages={onMessages} />);
    expect(screen.getByText('Ich habe gegangen zum Arzt.')).toBeInTheDocument();
    expect(screen.getByText(/Ich bin gegangen/)).toBeInTheDocument();
    expect(screen.getByText(reply('Wohin bist du gegangen?'))).toBeInTheDocument();
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Play reply 2' })).toBeInTheDocument();
  });

  it('shows a failed send with Try again, which sends the same recording again', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/speech/transcribe')) return delayedResponse({ clipId: 'c1', text: 'Hallo', words: [], duration: 1 });
        attempts += 1;
        return attempts === 1 ? delayedResponse({ error: 'x', code: 'ai_failed' }, { ok: false, status: 502 }) : delayedResponse({ messages: ADDED });
      })
    );
    const onMessages = vi.fn();
    renderWithIntl(<SpokenSession session={SESSION} onMessages={onMessages} />);
    await record();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onMessages).toHaveBeenCalledWith(ADDED));
  });

  it('keeps the mic usable after a 400, with no Try again, and sends a new recording', async () => {
    let clip = 0;
    let sends = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/speech/transcribe')) return delayedResponse({ clipId: `c${++clip}`, text: 'Hallo', words: [], duration: 1 });
        sends += 1;
        return sends === 1 ? delayedResponse({ error: 'x', code: 'bad_request' }, { ok: false, status: 400 }) : delayedResponse({ messages: ADDED });
      })
    );
    const onMessages = vi.fn();
    renderWithIntl(<SpokenSession session={SESSION} onMessages={onMessages} />);
    await record();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    await record();
    await waitFor(() => expect(onMessages).toHaveBeenCalledWith(ADDED));
  });

  it('shows a reply without audio as text, with "Audio unavailable right now" and no autoplay', async () => {
    const messages: SessionMessage[] = [...SESSION.messages, { id: 2, role: 'assistant', content: 'Nur Text.', extra: { clipId: 'r0', audio: false } }];
    renderWithIntl(<SpokenSession session={{ ...SESSION, messages }} onMessages={vi.fn()} />);
    expect(screen.getByText(reply('Nur Text.'))).toBeInTheDocument();
    expect(screen.getByText('Audio unavailable right now')).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    const messages: SessionMessage[] = [...SESSION.messages, ...ADDED];
    const { container } = renderWithIntl(<SpokenSession session={{ ...SESSION, messages }} onMessages={vi.fn()} />);
    expectNoViolations(await axe(container));
  });
});
