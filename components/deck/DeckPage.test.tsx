import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ShellProvider } from '@/components/shell/ShellContext';
import { DeckPage } from './DeckPage';

const DECK = {
  cards: [
    { itemId: 1, lemma: 'der Hund', plural: 'die Hunde', meaning: { en: 'dog', de: 'ein Tier, das bellt' }, example: 'Der Hund bellt.' },
    { itemId: 2, lemma: 'wohnen', plural: null, meaning: { en: 'to live', de: '' }, example: null },
  ],
  dueCount: 2,
  answeredToday: 0,
  newWordsPerDay: 10,
  deckReviewCap: 50,
  aiAvailable: true,
};

function renderPage() {
  return renderWithIntl(
    <ShellProvider>
      <DeckPage />
    </ShellProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('DeckPage', () => {
  it('reviews cards: flip, rate with keys or buttons, then shows the end', async () => {
    const fetchMock = vi.fn((url: string) => (url === '/api/flashcards' ? delayedResponse(DECK) : delayedResponse({ nextDueAt: '2026-10-01' })));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start review (2)' }));
    expect(screen.getByText('der Hund')).toBeInTheDocument();
    // Nothing rates before the card is flipped.
    fireEvent.keyDown(document.body, { key: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('dog')).toBeInTheDocument();
    expect(screen.getByText('Plural: die Hunde')).toBeInTheDocument();
    expect(screen.getByText('Der Hund bellt.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Meaning language' })).getByRole('button', { name: 'DE' }));
    expect(screen.getByText('ein Tier, das bellt')).toBeInTheDocument();
    // Key 4 has no rating (I4).
    fireEvent.keyDown(document.body, { key: '4' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: '1' });
    expect(await screen.findByText('wohnen')).toBeInTheDocument();
    // Enter flips; a lesson-style meaning with no German has no toggle (S20).
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.getByText('to live')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Meaning language' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Didn't know it" }));
    expect(await screen.findByText('Done for today: 2 cards reviewed.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/answer', expect.objectContaining({ body: JSON.stringify({ itemId: 1, rating: 'knew' }) }));
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/answer', expect.objectContaining({ body: JSON.stringify({ itemId: 2, rating: 'didnt_know' }) }));
  });

  it('keeps the card and shows an alert when a rating cannot be saved', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      url === '/api/flashcards' ? delayedResponse(DECK) : delayedResponse({ error: 'x', code: 'not_due' }, { ok: false, status: 409 })
    ));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start review (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort of' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This review is not due right now');
    expect(screen.getByText('der Hund')).toBeInTheDocument();
  });

  it('adds a word and shows duplicates inline', async () => {
    const fetchMock = vi.fn((url: string) =>
      url === '/api/flashcards' ? delayedResponse({ ...DECK, cards: [], dueCount: 0 }) : delayedResponse({ error: 'x', code: 'already_in_deck' }, { ok: false, status: 409 })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.change(await screen.findByLabelText('Add a word'), { target: { value: 'Hund' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This word is already in your deck'));
    expect(screen.getByText('Nothing to review right now.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/words', expect.objectContaining({ method: 'POST', body: JSON.stringify({ word: 'Hund', source: 'manual' }) }));
    // I14: the word list is fetched only once the student searches.
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/flashcards/words?'))).toBe(false);
  });

  it('disables adding without an AI provider and links to Settings', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ ...DECK, aiAvailable: false })));
    renderPage();
    expect(await screen.findByLabelText('Add a word')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Adding words needs a working AI provider.');
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
  });

  it('searches the deck as the student types', async () => {
    const fetchMock = vi.fn((url: string) =>
      url === '/api/flashcards' ? delayedResponse(DECK) : delayedResponse([{ itemId: 1, lemma: 'der Hund', meaning: { en: 'dog', de: '' } }])
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.change(await screen.findByLabelText('Search your words'), { target: { value: 'hu' } });
    const list = await screen.findByRole('list', { name: 'Search your words' });
    expect(list).toHaveTextContent('der Hund');
    expect(list).toHaveTextContent('dog');
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/words?query=hu');
  });

  it('saves a daily limit on blur and shows a rejected value inline', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/flashcards') return delayedResponse(DECK);
      const body = JSON.parse(String(init?.body));
      return body.newWordsPerDay === 99
        ? delayedResponse({ error: 'x', code: 'invalid_new_words_per_day' }, { ok: false, status: 400 })
        : delayedResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const field = await screen.findByLabelText('New words per day');
    fireEvent.change(field, { target: { value: '99' } });
    fireEvent.blur(field);
    expect(await screen.findByRole('alert')).toHaveTextContent('New words per day must be a whole number from 0 to 50');
    fireEvent.change(field, { target: { value: '5' } });
    fireEvent.blur(field);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ newWordsPerDay: 5 }) }));
  });
});
