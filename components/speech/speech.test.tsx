import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { MicButton } from './MicButton';
import { PronunciationBox } from './PronunciationBox';

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
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: this.mimeType }) });
    this.onstop?.();
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
    renderWithIntl(<PronunciationBox estimate={{ score: 72, unclear: ['Straße'] }} comment="Watch the ß." />);
    expect(screen.getByText('Pronunciation (estimate)')).toBeInTheDocument();
    expect(screen.getByText(/Mostly clear/i)).toBeInTheDocument();
    expect(screen.getByText('Straße')).toBeInTheDocument();
    expect(screen.getByText('Watch the ß.')).toBeInTheDocument();
    expect(screen.getByText('Estimated from speech recognition.')).toBeInTheDocument();
  });
});
