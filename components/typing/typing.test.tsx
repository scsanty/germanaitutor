import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { GermanTextarea } from './GermanTextarea';
import { GermanTextInput } from './GermanTextInput';
import { WordCounter, countWords } from './WordCounter';

function Harness() {
  const [text, setText] = useState('Ich muss gehen');
  return <GermanTextarea aria-label="Your text" value={text} onChange={(e) => setText(e.target.value)} />;
}

describe('GermanTextarea', () => {
  beforeEach(() => localStorage.clear());

  // Review Focus 2
  it('replaces the selection with the umlaut and puts the caret after it', () => {
    renderWithIntl(<Harness />);
    const box = screen.getByLabelText('Your text') as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('button', { name: 'äöü' }));
    box.focus();
    box.setSelectionRange(5, 6); // the "u" in "muss"
    fireEvent.click(screen.getByRole('button', { name: 'Insert ü' }));
    expect(box.value).toBe('Ich müss gehen');
    expect(box.selectionStart).toBe(6);
    expect(box.selectionEnd).toBe(6);
    expect(document.activeElement).toBe(box);
  });

  it('starts closed, with the toggle reflecting the state', () => {
    renderWithIntl(<Harness />);
    const toggle = screen.getByRole('button', { name: 'äöü' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Insert ß' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('remembers whether the row is open', () => {
    const first = renderWithIntl(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'äöü' }));
    first.unmount();
    renderWithIntl(<Harness />);
    expect(screen.getByRole('button', { name: 'Insert ß' })).toBeInTheDocument();
  });

  // Final review Important 3: blocked storage loses the memory, not the row.
  it('still opens and closes the row when localStorage throws', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked),
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked),
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked),
    ];
    try {
      renderWithIntl(<Harness />);
      const toggle = screen.getByRole('button', { name: 'äöü' });
      // The in-memory state carries over from earlier tests (as it would within one page load).
      if (toggle.getAttribute('aria-pressed') === 'true') fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Insert ß' })).toBeInTheDocument();
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('button', { name: 'Insert ß' })).not.toBeInTheDocument();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it('disables the letters when the field is read-only', () => {
    renderWithIntl(<GermanTextarea aria-label="Your text" value="x" readOnly onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'äöü' })).toBeDisabled();
  });
});

describe('GermanTextInput', () => {
  beforeEach(() => localStorage.clear());

  it('inserts at the caret of a single-line field and forwards props', () => {
    function InputHarness() {
      const [v, setV] = useState('Mdchen');
      return <GermanTextInput id="w" lang="de" aria-label="Word" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    renderWithIntl(<InputHarness />);
    const box = screen.getByLabelText('Word') as HTMLInputElement;
    expect(box).toHaveAttribute('lang', 'de');
    expect(box).toHaveAttribute('id', 'w');
    fireEvent.click(screen.getByRole('button', { name: 'äöü' }));
    box.focus();
    box.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Insert ä' }));
    expect(box.value).toBe('Mädchen');
    expect(box.selectionStart).toBe(2);
  });
});

describe('WordCounter', () => {
  it('counts words and marks counts outside the target', () => {
    expect(countWords('  Ich bin   hier. ')).toBe(3);
    expect(countWords('   ')).toBe(0);
    const { rerender } = renderWithIntl(<WordCounter text="a b c" target={{ min: 2, max: 4 }} />);
    expect(screen.getByText('3 / 2–4 words')).toHaveAttribute('data-state', 'ok');
    rerender(<WordCounter text="a" target={{ min: 2, max: 4 }} />);
    expect(screen.getByText('1 / 2–4 words')).toHaveAttribute('data-state', 'off');
  });

  it('shows a plain count without a target', () => {
    renderWithIntl(<WordCounter text="eins zwei" />);
    expect(screen.getByText('2 words')).toHaveAttribute('data-state', 'ok');
  });
});
