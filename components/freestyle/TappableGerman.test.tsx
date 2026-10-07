import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { TappableGerman, splitSentences } from './TappableGerman';

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

  it('leaves one-letter tokens as plain text', () => {
    renderWithIntl(<TappableGerman text="Punkt a, z.B. hier." />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Punkt', 'hier']);
  });

  it('cuts the example sentence without stopping at abbreviations or ordinals', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ itemId: 1, lemma: 'das Café', status: 'added' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<TappableGerman text="Wir treffen uns am 3. Mai, z.B. im Café. Dann gehen wir." />);
    fireEvent.click(screen.getByRole('button', { name: 'Café' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    await screen.findByText('Saved: das Café');
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).sentence).toBe(
      'Wir treffen uns am 3. Mai, z.B. im Café.'
    );
  });

  it('splits sentences at real ends only', () => {
    expect(splitSentences('Dr. Weber kommt ca. um 3. Sie wartet usw. und bzw. d.h. u.a. hier! Gut? Ja').map((x) => x.text)).toEqual([
      'Dr. Weber kommt ca. um 3. Sie wartet usw. und bzw. d.h. u.a. hier!',
      'Gut?',
      'Ja',
    ]);
  });

  it('moves the popover to a second word tapped', async () => {
    renderWithIntl(<TappableGerman text="Hallo Welt" />);
    const hallo = screen.getByRole('button', { name: 'Hallo' });
    const welt = screen.getByRole('button', { name: 'Welt' });
    fireEvent.click(hallo);
    expect(within(await screen.findByRole('dialog')).getByText('Hallo')).toBeInTheDocument();
    fireEvent.click(welt);
    expect(welt).toHaveAttribute('aria-expanded', 'true');
    expect(hallo).toHaveAttribute('aria-expanded', 'false');
    expect(within(screen.getByRole('dialog')).getByText('Welt')).toHaveAttribute('lang', 'de');
    expect(within(screen.getByRole('dialog')).queryByText('Hallo')).not.toBeInTheDocument();
  });

  it('leaves focus where the student tapped when they tap outside', async () => {
    renderWithIntl(
      <>
        <TappableGerman text="Hallo Welt" />
        <textarea aria-label="Elsewhere" />
      </>
    );
    const welt = screen.getByRole('button', { name: 'Welt' });
    fireEvent.click(welt);
    await screen.findByRole('dialog');
    await new Promise((r) => setTimeout(r, 0)); // Radix arms its outside-pointer listener on the next tick.
    fireEvent.pointerDown(screen.getByLabelText('Elsewhere'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 10));
    expect(welt).not.toHaveFocus();
  });

  it('returns focus to the word on Escape', async () => {
    renderWithIntl(<TappableGerman text="Hallo Welt" />);
    const welt = screen.getByRole('button', { name: 'Welt' });
    fireEvent.click(welt);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(welt).toHaveFocus());
  });
});
