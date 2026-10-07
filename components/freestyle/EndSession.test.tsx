import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { EndSession } from './EndSession';

const SUMMARY = {
  wentWell: [{ en: 'Good questions', de: 'Gute Fragen' }],
  mistakes: [{ en: 'Perfekt with sein', de: 'Perfekt mit sein' }],
  words: [
    { lemma: 'der Termin', meaningEn: 'appointment' },
    { lemma: 'die Praxis', meaningEn: 'practice' },
  ],
};

function stub(routes: Record<string, (() => Promise<unknown>)[]>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const queue = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!queue?.length) throw new Error(`Unexpected ${url}`);
    return (queue.length > 1 ? queue.shift()! : queue[0])();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('EndSession', () => {
  it('confirms, shows the summary, and saves the chosen words', async () => {
    const fetchMock = stub({
      'POST /api/freestyle/conversation/end': [() => delayedResponse({ summary: SUMMARY })],
      'POST /api/flashcards/words': [
        () => delayedResponse({ itemId: 1, lemma: 'der Termin', status: 'added' }),
        () => delayedResponse({ error: 'x', code: 'already_in_deck' }, { ok: false, status: 409 }),
      ],
    });
    const onEnded = vi.fn();
    renderWithIntl(<EndSession mode="conversation" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(await screen.findByText('Good questions')).toBeInTheDocument();
    expect(screen.getByText('Perfekt with sein')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Gute Fragen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save selected' }));
    expect(await screen.findByText('Saved: der Termin')).toHaveAttribute('role', 'status');
    expect(await screen.findByText('die Praxis is already in your deck')).toBeInTheDocument();
    const saves = fetchMock.mock.calls.filter(([u]) => u === '/api/flashcards/words');
    expect(saves).toHaveLength(2);
    expect(saves[0][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ word: 'der Termin', source: 'freestyle' }) }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onEnded).toHaveBeenCalled();
  });

  it('saves only the words left checked, and hides the toggle when the summary reads the same in both languages', async () => {
    const same = { ...SUMMARY, wentWell: [{ en: 'Good questions', de: '' }], mistakes: [] };
    const fetchMock = stub({
      'POST /api/freestyle/conversation/end': [() => delayedResponse({ summary: same })],
      'POST /api/flashcards/words': [() => delayedResponse({ itemId: 2, lemma: 'die Praxis', status: 'added' })],
    });
    renderWithIntl(<EndSession mode="conversation" onEnded={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /der Termin/ }));
    expect(screen.queryByRole('group', { name: 'Summary language' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save selected' }));
    expect(await screen.findByText('Saved: die Praxis')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/flashcards/words')).toHaveLength(1);
  });

  it('offers retry or ending without a summary when the summary fails', async () => {
    const fetchMock = stub({
      'POST /api/freestyle/conversation/end': [
        () => delayedResponse({ error: 'No AI provider is set up', code: 'no_provider' }, { ok: false, status: 502 }),
        () => delayedResponse({ summary: null }),
      ],
    });
    const onEnded = vi.fn();
    renderWithIntl(<EndSession mode="conversation" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No AI provider is set up');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'End without summary' }));
    await waitFor(() => expect(onEnded).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/freestyle/conversation/end', expect.objectContaining({ body: JSON.stringify({ skipSummary: true }) }));
  });
  it('keeps the summary open on Esc, so only Done leaves', async () => {
    stub({ 'POST /api/freestyle/conversation/end': [() => delayedResponse({ summary: SUMMARY })] });
    const onEnded = vi.fn();
    renderWithIntl(<EndSession mode="conversation" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    const dialog = await screen.findByRole('alertdialog');
    await screen.findByText('Good questions');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onEnded).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /der Termin/ })).toBeChecked();
  });

  it('treats a session that is already gone as ended', async () => {
    stub({ 'POST /api/freestyle/conversation/end': [() => delayedResponse({ error: 'x', code: 'not_found' }, { ok: false, status: 404 })] });
    const onEnded = vi.fn();
    renderWithIntl(<EndSession mode="conversation" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(onEnded).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends a single End request on a double click', async () => {
    const fetchMock = stub({ 'POST /api/freestyle/conversation/end': [() => delayedResponse({ summary: SUMMARY })] });
    renderWithIntl(<EndSession mode="conversation" onEnded={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    const confirm = screen.getByRole('button', { name: 'End session' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByText('Good questions')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
