import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { AudioActions } from './AudioActions';

const HASH = 'a'.repeat(64);
const TRANSCRIPT = '[Anna f] Hallo.';
const status = (over: Record<string, unknown> = {}) => ({ hash: HASH, status: 'done', hasFile: true, lastError: null, saved: true, ...over });

function stubFetch(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const pick = (file: File) => fireEvent.change(screen.getByLabelText('Exercise 1 recording'), { target: { files: [file] } });

describe('AudioActions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('regenerates and shows Queued', async () => {
    const statuses = [status(), status({ status: 'pending', hasFile: false })];
    const fetchMock = stubFetch({
      'POST /api/admin/audio': () => delayedResponse(statuses.shift()!),
      [`POST /api/admin/audio/${HASH}`]: () => delayedResponse({ status: 'queued' }),
    });
    render(<AudioActions transcript={TRANSCRIPT} label="Exercise 1" />);
    expect(await screen.findByText('Generated audio ready')).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ transcript: TRANSCRIPT });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Queued');
    expect(await screen.findByText('Queued for generation')).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls.find(([u]) => u === `/api/admin/audio/${HASH}`)![1]!.body))).toEqual({});
  });

  it('asks before regenerating over an uploaded recording (Review Focus 2)', async () => {
    const fetchMock = stubFetch({
      'POST /api/admin/audio': () => delayedResponse(status({ status: 'uploaded' })),
      [`POST /api/admin/audio/${HASH}`]: () => delayedResponse({ status: 'queued' }),
    });
    render(<AudioActions transcript={TRANSCRIPT} label="Exercise 1" />);
    expect(await screen.findByText('Uploaded recording')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(screen.getByText('This deletes the uploaded recording and generates speech instead.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => u === `/api/admin/audio/${HASH}`)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace recording' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Queued');
    const sent = fetchMock.mock.calls.filter(([u]) => u === `/api/admin/audio/${HASH}`);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(String(sent[0][1]!.body))).toEqual({ replaceUpload: true });
  });

  it('uploads the chosen file as the PUT body', async () => {
    const fetchMock = stubFetch({
      'POST /api/admin/audio': () => delayedResponse(status()),
      [`PUT /api/admin/audio/${HASH}`]: () => delayedResponse({ ok: true }),
    });
    render(<AudioActions transcript={TRANSCRIPT} label="Exercise 1" />);
    await screen.findByText('Generated audio ready');
    expect(screen.getByLabelText('Exercise 1 recording')).toHaveAttribute('accept', 'audio/*');
    const file = new File([new Uint8Array([1, 2, 3])], 'take.mp3', { type: 'audio/mpeg' });
    pick(file);
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Uploaded');
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/audio/${HASH}`, { method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, body: file });
  });

  it('refuses a file over 20 MB without sending it, and shows a server error', async () => {
    const fetchMock = stubFetch({
      'POST /api/admin/audio': () => delayedResponse(status()),
      [`PUT /api/admin/audio/${HASH}`]: () => delayedResponse({ error: 'The speech service is not reachable' }, { ok: false, status: 503 }),
    });
    render(<AudioActions transcript={TRANSCRIPT} label="Exercise 1" />);
    await screen.findByText('Generated audio ready');
    const big = new File(['x'], 'big.wav', { type: 'audio/wav' });
    Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
    pick(big);
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The recording is larger than 20 MB');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

    pick(new File(['x'], 'ok.wav', { type: 'audio/wav' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The speech service is not reachable'));
  });

  it('disables the actions until the content is saved, and explains a bad transcript', async () => {
    const answers = [
      () => delayedResponse(status({ saved: false, status: null, hasFile: false })),
      () => delayedResponse({ error: "The transcript can't be rendered: the transcript is empty" }, { ok: false, status: 400 }),
    ];
    stubFetch({ 'POST /api/admin/audio': () => answers.shift()!() });
    const { rerender } = render(<AudioActions transcript={TRANSCRIPT} label="Exercise 1" />);
    expect(await screen.findByText('Save first to regenerate or upload this audio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
    expect(screen.getByLabelText('Exercise 1 recording')).toBeDisabled();
    rerender(<AudioActions transcript="" label="Exercise 1" />);
    expect(await screen.findByText("The transcript can't be rendered: the transcript is empty")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
  });
});
