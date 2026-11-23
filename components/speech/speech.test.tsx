import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { MicButton } from './MicButton';
import { PronunciationBox } from './PronunciationBox';
import { MAX_SECONDS, SPEECH_LIMIT_SECONDS } from './useRecorder';

class FakeRecorder {
  static isTypeSupported = vi.fn(() => true);
  mimeType: string;
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm';
  }
  start() {
    this.state = 'recording';
  }
  // Like a browser, the stop event arrives later.
  stop() {
    this.state = 'inactive';
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(['abc'], { type: this.mimeType }) });
      this.onstop?.();
    }, 0);
  }
}

const trackStop = vi.fn();
const RESULT = { clipId: 'c1', text: 'Hallo Welt', words: [{ word: 'Hallo', start: 0, end: 1, probability: 0.9 }], duration: 2 };

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  trackStop.mockClear();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('MicButton', () => {
  it('records, uploads once and hands over the transcript', async () => {
    const fetchMock = mockFetch(json(RESULT));
    const onTranscript = vi.fn();
    renderWithIntl(<MicButton scope="lesson:a1-greet" onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    const stop = await screen.findByRole('button', { name: 'Stop and send' });
    fireEvent.click(stop);
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith(RESULT));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/speech/transcribe?scope=lesson%3Aa1-greet');
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe('audio/webm;codecs=opus');
    expect(trackStop).toHaveBeenCalled();
  });

  it('uploads once on a double click on stop', async () => {
    const fetchMock = mockFetch(json(RESULT));
    const onTranscript = vi.fn();
    renderWithIntl(<MicButton scope="lesson:a1-greet" onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    const stop = await screen.findByRole('button', { name: 'Stop and send' });
    fireEvent.click(stop);
    fireEvent.click(stop);
    await waitFor(() => expect(onTranscript).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains a denied microphone in an alert', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    renderWithIntl(<MicButton scope="placement" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The microphone isn't available. Allow it in your browser; it only works on HTTPS or localhost.");
  });

  it('treats a missing mediaDevices (insecure origin) as denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderWithIntl(<MicButton scope="placement" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS or localhost');
  });

  it('keeps the recording when the upload fails and retries without recording again', async () => {
    const fetchMock = mockFetch(json({ error: 'Speech service is down' }, 502), json(RESULT));
    const onTranscript = vi.fn();
    renderWithIntl(<MicButton scope="freestyle:spoken" onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop and send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Speech service is down');
    expect(onTranscript).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith(RESULT));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('auto-stops with headroom under the sidecar limit', () => {
    expect(MAX_SECONDS).toBe(290);
    expect(SPEECH_LIMIT_SECONDS).toBe(300);
    // A late tick plus the recorder's flush must still leave the clip under the limit.
    expect(MAX_SECONDS + 5).toBeLessThan(SPEECH_LIMIT_SECONDS);
  });

  it('stops and uploads by itself at 290 seconds, not before', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = mockFetch(json(RESULT));
      const onTranscript = vi.fn();
      renderWithIntl(<MicButton scope="placement" onTranscript={onTranscript} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(289_000);
      });
      expect(fetchMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onTranscript).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens one stream on a double tap on start', async () => {
    renderWithIntl(<MicButton scope="placement" onTranscript={vi.fn()} />);
    const startBtn = screen.getByRole('button', { name: 'Start speaking' });
    fireEvent.click(startBtn);
    fireEvent.click(startBtn);
    await screen.findByRole('button', { name: 'Stop and send' });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('releases the stream when unmounted during the permission prompt', async () => {
    let grant!: (s: unknown) => void;
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => (grant = r)));
    const { unmount } = renderWithIntl(<MicButton scope="placement" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    unmount();
    await act(async () => grant({ getTracks: () => [{ stop: trackStop }] }));
    expect(trackStop).toHaveBeenCalled();
  });

  it('reports another microphone failure as a microphone error', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new DOMException('busy', 'NotReadableError'));
    renderWithIntl(<MicButton scope="placement" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The microphone could not be started.');
  });

  it('shows the timer while recording and stops tracks on unmount', async () => {
    mockFetch();
    const { unmount } = renderWithIntl(<MicButton scope="placement" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    await screen.findByRole('button', { name: 'Stop and send' });
    expect(screen.getByText('0:00')).toBeInTheDocument();
    await act(async () => unmount());
    expect(trackStop).toHaveBeenCalled();
  });
});

describe('PronunciationBox', () => {
  it('shows the band, the unclear words and the note', () => {
    renderWithIntl(<PronunciationBox estimate={{ score: 72, unclear: ['Straße'] }} comment={{ en: 'Watch the ß.', de: 'Watch the ß.' }} />);
    expect(screen.getByText('Pronunciation (estimate)')).toBeInTheDocument();
    expect(screen.getByText(/Mostly clear/i)).toBeInTheDocument();
    expect(screen.getByText('Straße')).toBeInTheDocument();
    expect(screen.getByText('Watch the ß.')).toBeInTheDocument();
    expect(screen.getByText('Estimated from speech recognition.')).toBeInTheDocument();
  });

  it('switches the comment language with the toggle', () => {
    renderWithIntl(<PronunciationBox estimate={{ score: 90, unclear: [] }} comment={{ en: 'Nice and clear.', de: 'Schön deutlich.' }} />);
    expect(screen.getByText('Nice and clear.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Schön deutlich.')).toBeInTheDocument();
  });
});
