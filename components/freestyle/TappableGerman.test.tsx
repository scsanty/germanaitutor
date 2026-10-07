import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { TappableGerman } from './TappableGerman';

afterEach(() => vi.unstubAllGlobals());

describe('TappableGerman', () => {
  it('makes every word a button and leaves punctuation as text', () => {
    renderWithIntl(<TappableGerman text="Na, wie geht's?" />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Na', 'wie', "geht's"]);
  });

  it('saves a tapped word with the sentence it sits in, from Freestyle', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ itemId: 1, lemma: 'der Termin', status: 'added' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<TappableGerman text="Hallo! Ich brauche einen Termin." />);
    fireEvent.click(screen.getByRole('button', { name: 'Termin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    expect(await screen.findByText('Saved: der Termin')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'Termin', sentence: 'Ich brauche einen Termin.', source: 'freestyle' }),
    });
  });

  it('uses the sentence it is given', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ itemId: 1, lemma: 'die Welt', status: 'added' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<TappableGerman text="Welt" sentence="Hallo Welt." />);
    fireEvent.click(screen.getByRole('button', { name: 'Welt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    await screen.findByText('Saved: die Welt');
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({
      word: 'Welt',
      sentence: 'Hallo Welt.',
      source: 'freestyle',
    });
  });

  it('tells the student when the word is already in the deck', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ error: 'x', code: 'already_in_deck' }, { ok: false, status: 409 })));
    renderWithIntl(<TappableGerman text="Hallo Welt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Welt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This word is already in your deck'));
  });

  it('starts fresh for the next word tapped', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ itemId: 1, lemma: 'die Welt', status: 'added' })));
    renderWithIntl(<TappableGerman text="Hallo Welt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Welt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    await screen.findByText('Saved: die Welt');
    fireEvent.click(screen.getByRole('button', { name: 'Hallo' }));
    expect(await screen.findByRole('button', { name: 'Save to deck' })).toBeInTheDocument();
    expect(screen.queryByText('Saved: die Welt')).not.toBeInTheDocument();
  });
});
