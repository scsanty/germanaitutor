import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ReadingSession } from './ReadingSession';

const article = (title: string) => ({
  title,
  text: 'Anna spielt Fußball.',
  questions: [
    { question: 'Was spielt Anna?', options: ['Tennis', 'Fußball', 'Golf'], correctIndex: 1 },
    { question: 'Wer spielt?', options: ['Anna', 'Ben', 'Carl'], correctIndex: 0 },
    { question: 'Wo?', options: ['Im Park', 'Im Haus', 'Keine Angabe'], correctIndex: 2 },
  ],
});
const SESSION = { mode: 'free_reading' as const, level: 'A1' as const, setup: { topic: 'Sport', article: article('Sport') }, messages: [] };

afterEach(() => vi.unstubAllGlobals());

describe('ReadingSession', () => {
  it('renders the article words as tap targets', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWithIntl(<ReadingSession session={SESSION} onSession={vi.fn()} />);
    expect(screen.getByTestId('article')).toHaveTextContent('Anna spielt Fußball.');
    expect(within(screen.getByTestId('article')).getByRole('button', { name: 'Fußball' })).toBeInTheDocument();
  });

  it('checks answers locally and shows the right option', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWithIntl(<ReadingSession session={SESSION} onSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Tennis' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Anna' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(screen.getByText('2 of 3 unanswered or wrong')).toBeInTheDocument();
    expect(screen.getAllByText(/Right answer:/)).toHaveLength(2);
    expect(screen.getByText('Right answer: Fußball')).toBeInTheDocument();
    expect(screen.getByText('Right answer: Keine Angabe')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads another article', async () => {
    const onSession = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ ...SESSION, setup: { topic: 'Sport', article: article('Neu') } })));
    renderWithIntl(<ReadingSession session={SESSION} onSession={onSession} />);
    fireEvent.click(screen.getByRole('button', { name: 'Another article' }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(expect.objectContaining({ setup: expect.objectContaining({ article: expect.objectContaining({ title: 'Neu' }) }) })));
    expect(fetch).toHaveBeenCalledWith('/api/freestyle/free_reading/article', expect.objectContaining({ method: 'POST' }));
  });

  it('shows an alert when a new article fails', async () => {
    const onSession = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ error: 'x', code: 'ai_failed' }, { ok: false, status: 502 })));
    renderWithIntl(<ReadingSession session={SESSION} onSession={onSession} />);
    fireEvent.click(screen.getByRole('button', { name: 'Another article' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSession).not.toHaveBeenCalled();
  });
});
