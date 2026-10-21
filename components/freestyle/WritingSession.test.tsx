import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { WritingSession } from './WritingSession';

const SESSION = { mode: 'free_writing' as const, level: 'B1' as const, setup: { prompt: 'Urlaub' }, messages: [] };
const REPLY = {
  messages: [
    { id: 1, role: 'user', content: 'Ich habe nach Rom gefahren.', extra: null },
    {
      id: 2,
      role: 'assistant',
      content: 'Ich bin nach Rom gefahren.',
      extra: { corrections: [{ wrong: 'habe', right: 'bin', reason: { en: 'fahren takes sein', de: 'fahren mit sein' } }], comment: { en: 'Nice!', de: 'Schön!' } },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('WritingSession', () => {
  it('counts words, submits, shows the corrected version, and pre-fills a revision', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse(REPLY)));
    const onMessages = vi.fn();
    const { rerender } = renderWithIntl(<WritingSession session={SESSION} onMessages={onMessages} />);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'Ich habe nach Rom gefahren.' } });
    expect(screen.getByText('5 words')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onMessages).toHaveBeenCalledWith(REPLY.messages));
    expect(fetch).toHaveBeenCalledWith('/api/freestyle/free_writing/message', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Ich habe nach Rom gefahren.' }) }));
    expect(screen.getByLabelText('Your text')).toHaveValue('');
    rerender(<WritingSession session={{ ...SESSION, messages: REPLY.messages as never }} onMessages={onMessages} />);
    expect(screen.getByTestId('corrected')).toHaveTextContent('Ich bin nach Rom gefahren.');
    expect(screen.getByRole('button', { name: 'gefahren' })).toBeInTheDocument();
    expect(screen.getByText('Nice!')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Corrections' })).toHaveTextContent('fahren takes sein');
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(screen.getByLabelText('Your text')).toHaveValue('Ich habe nach Rom gefahren.');
  });

  it('does not overwrite text the student has typed when Revise is pressed', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWithIntl(<WritingSession session={{ ...SESSION, messages: REPLY.messages as never }} onMessages={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'Mein neuer Text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(screen.getByLabelText('Your text')).toHaveValue('Mein neuer Text');
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(screen.getByLabelText('Your text')).toHaveValue('Ich habe nach Rom gefahren.');
  });

  it('switches the comment language only when it differs', () => {
    vi.stubGlobal('fetch', vi.fn());
    const same = [REPLY.messages[0], { ...REPLY.messages[1], extra: { corrections: [], comment: { en: 'OK', de: 'OK' } } }];
    const { rerender } = renderWithIntl(<WritingSession session={{ ...SESSION, messages: same as never }} onMessages={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Comment language' })).not.toBeInTheDocument();
    rerender(<WritingSession session={{ ...SESSION, messages: REPLY.messages as never }} onMessages={vi.fn()} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Comment language' })).getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Schön!')).toBeInTheDocument();
  });

  it('lists earlier versions above, newest last', () => {
    vi.stubGlobal('fetch', vi.fn());
    const second = [
      { id: 3, role: 'user', content: 'Ich bin nach Rom gefahren.', extra: null },
      { id: 4, role: 'assistant', content: 'Ich bin nach Rom gefahren.', extra: { corrections: [], comment: { en: 'Perfect.', de: 'Perfekt.' } } },
    ];
    renderWithIntl(<WritingSession session={{ ...SESSION, messages: [...REPLY.messages, ...second] as never }} onMessages={vi.fn()} />);
    const headings = screen.getAllByRole('heading', { name: /^Version \d$/ }).map((h) => h.textContent);
    expect(headings).toEqual(['Version 1', 'Version 2']);
    expect(screen.getAllByRole('button', { name: 'Revise' })).toHaveLength(1);
  });

  it('keeps the text and shows an alert when the submit fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ error: 'x', code: 'ai_failed' }, { ok: false, status: 502 })));
    const onMessages = vi.fn();
    renderWithIntl(<WritingSession session={SESSION} onMessages={onMessages} />);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'Hallo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Your text')).toHaveValue('Hallo');
    expect(onMessages).not.toHaveBeenCalled();
  });
});

// S11: "Copy into free writing" leaves the letter in sessionStorage; the box takes it once.
describe('WritingSession draft from a Teil letter', () => {
  afterEach(() => sessionStorage.clear());

  it('pre-fills the empty box with the stored draft and removes it', () => {
    sessionStorage.setItem('nadoch.writingDraft', 'Sehr geehrte Damen und Herren');
    renderWithIntl(<WritingSession session={SESSION} onMessages={vi.fn()} />);
    expect(screen.getByLabelText('Your text')).toHaveValue('Sehr geehrte Damen und Herren');
    expect(sessionStorage.getItem('nadoch.writingDraft')).toBeNull();
  });

  it('works without a stored draft, and when storage throws', () => {
    renderWithIntl(<WritingSession session={SESSION} onMessages={vi.fn()} />);
    expect(screen.getByLabelText('Your text')).toHaveValue('');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderWithIntl(<WritingSession session={SESSION} onMessages={vi.fn()} />);
    spy.mockRestore();
  });
});

describe('WritingSession marked-up corrections (T8)', () => {
  const withReply = (content: string, corrections: unknown[]) => ({
    ...SESSION,
    messages: [
      { id: 1, role: 'user', content, extra: null },
      { id: 2, role: 'assistant', content: 'Korrigiert.', extra: { corrections, comment: { en: 'Nice!', de: 'Schön!' } } },
    ] as never,
  });

  it('marks each correction in the submitted text and opens the fix, and lists every correction', () => {
    vi.stubGlobal('fetch', vi.fn());
    const corrections = [
      { wrong: 'habe', right: 'bin', category: 'perfect_auxiliary', reason: { en: 'fahren takes sein', de: 'fahren mit sein' } },
      { wrong: 'nicht im Text', right: 'x', category: 'other', reason: { en: 'missing', de: 'fehlt' } },
    ];
    renderWithIntl(<WritingSession session={withReply('Ich habe nach Rom gefahren.', corrections)} onMessages={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'habe' }));
    expect(screen.getByRole('dialog', { name: 'habe' })).toHaveTextContent('bin');
    expect(screen.getAllByRole('button', { name: /habe|nicht im Text/ })).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Corrections' })).toHaveTextContent('nicht im Text');
  });

  it('renders an old message without categories or a findable text without crashing', () => {
    vi.stubGlobal('fetch', vi.fn());
    const old = [{ wrong: 'habe', right: 'bin', reason: { en: 'sein', de: 'sein' } }];
    renderWithIntl(<WritingSession session={withReply('Ich habe nach Rom gefahren.', old)} onMessages={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'habe' })).toBeInTheDocument();
  });

  it('marks text typed with decomposed umlauts', () => {
    vi.stubGlobal('fetch', vi.fn());
    const corrections = [{ wrong: 'Müller'.normalize('NFC'), right: 'Mueller', category: 'spelling', reason: { en: 'x', de: 'y' } }];
    renderWithIntl(<WritingSession session={withReply('Herr Müller kommt.'.normalize('NFD'), corrections)} onMessages={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Müller' })).toBeInTheDocument();
  });

  it('marks corrections the model listed out of text order, keeping repeats in order', () => {
    vi.stubGlobal('fetch', vi.fn());
    const c = (wrong: string) => ({ wrong, right: 'x', category: 'other', reason: { en: 'r', de: 'r' } });
    renderWithIntl(<WritingSession session={withReply('Ich habe nach Rom gefahren und habe gegessen.', [c('gefahren'), c('habe'), c('habe')])} onMessages={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /^(habe|gefahren)$/ }).map((b) => b.textContent)).toEqual(['habe', 'gefahren', 'habe']);
  });
});
