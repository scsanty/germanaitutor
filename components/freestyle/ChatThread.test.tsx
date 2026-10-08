import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { ChatThread } from './ChatThread';

const MESSAGES = [
  { id: 1, role: 'assistant' as const, content: 'Was hast du gemacht?', extra: null },
  {
    id: 2,
    role: 'user' as const,
    content: 'Ich habe gegangen.',
    extra: { corrections: [{ wrong: 'habe gegangen', right: 'bin gegangen', reason: { en: 'gehen takes sein', de: 'gehen mit sein' } }] },
  },
  { id: 3, role: 'assistant' as const, content: 'Und dann?', extra: { verdict: 'almost', explanation: { en: 'Nearly.', de: 'Fast.' } } },
];

describe('ChatThread', () => {
  it('shows inline corrections under the student’s message with a language toggle, and drill verdicts', () => {
    renderWithIntl(<ChatThread mode="conversation" messages={MESSAGES} onSend={vi.fn()} />);
    expect(screen.getByText('habe gegangen').tagName).toBe('S');
    expect(screen.getByText('bin gegangen').tagName).toBe('STRONG');
    expect(screen.getByText('gehen takes sein')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'DE' })[0]);
    expect(screen.getByText('gehen mit sein')).toBeInTheDocument();
    expect(screen.getByText('Almost')).toBeInTheDocument();
    expect(screen.getByText('Nearly.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'DE' })[1]);
    expect(screen.getByText('Fast.')).toBeInTheDocument();
  });

  it('shows no language toggle when a reason reads the same in both languages', () => {
    const same = [
      { id: 1, role: 'user' as const, content: 'Ich gehe Hause.', extra: { corrections: [{ wrong: 'Hause', right: 'nach Hause', reason: { en: 'nach Hause', de: '' } }] } },
    ];
    renderWithIntl(<ChatThread mode="conversation" messages={same} onSend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'DE' })).not.toBeInTheDocument();
  });

  it('makes the words of AI messages tappable, not the student’s', () => {
    renderWithIntl(<ChatThread mode="conversation" messages={MESSAGES} onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'gemacht' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ich' })).not.toBeInTheDocument();
  });

  it('sends a message, disables sending meanwhile, and keeps the text when sending fails', async () => {
    let fail = true;
    const onSend = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      if (fail) throw new Error('The AI replied in an unexpected format');
    });
    renderWithIntl(<ChatThread mode="conversation" messages={[]} onSend={onSend} />);
    const box = screen.getByLabelText('Your message');
    fireEvent.change(box, { target: { value: 'Hallo!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI replied in an unexpected format');
    expect(box).toHaveValue('Hallo!');
    fail = false;
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(box).toHaveValue(''));
    expect(onSend).toHaveBeenLastCalledWith('Hallo!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('inserts umlauts at the cursor', () => {
    renderWithIntl(<ChatThread mode="grammar_drill" messages={[]} onSend={vi.fn()} />);
    const box = screen.getByLabelText('Your message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Mdchen' } });
    box.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'ä' }));
    expect(box).toHaveValue('Mädchen');
  });

  it('sends once when Send or Enter is pressed again while sending', async () => {
    let finish: () => void = () => {};
    const onSend = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderWithIntl(<ChatThread mode="conversation" messages={[]} onSend={onSend} />);
    const box = screen.getByLabelText('Your message');
    fireEvent.change(box, { target: { value: 'Hallo!' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(box).toHaveAttribute('readonly');
    finish();
    await waitFor(() => expect(box).toHaveValue(''));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
