import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { ShellProvider, useShell } from '@/components/shell/ShellContext';
import { FocusLayout } from './FocusLayout';
import { useExerciseShortcuts } from './useExerciseShortcuts';

function ShellState() {
  return <p>{useShell().focus ? 'focus on' : 'focus off'}</p>;
}

function Shortcuts({ onPick, onEnter }: { onPick: (i: number) => void; onEnter: () => void }) {
  useExerciseShortcuts({ onPick, onEnter });
  return <input aria-label="Your answer" />;
}

describe('FocusLayout', () => {
  it('turns focus mode on while shown and off when gone', () => {
    const { unmount } = renderWithIntl(
      <ShellProvider>
        <ShellState />
        <FocusLayout progress={{ current: 2, total: 5 }} confirmExit={false} onExit={vi.fn()}>
          <p>exercise</p>
        </FocusLayout>
      </ShellProvider>
    );
    expect(screen.getByText('focus on')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Exercise 2 of 5' })).toBeInTheDocument();
    unmount();
  });

  it('asks before leaving mid-run, and exits straight away when nothing is at stake', () => {
    const onExit = vi.fn();
    const { rerender } = renderWithIntl(
      <FocusLayout progress={{ current: 2, total: 5 }} confirmExit onExit={onExit}>
        <p>exercise</p>
      </FocusLayout>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Leave this exercise? Your progress on answered exercises is kept.');
    fireEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    expect(onExit).toHaveBeenCalledTimes(1);

    // Review Focus 3: no confirmation when nothing is in progress.
    rerender(
      <FocusLayout progress={null} confirmExit={false} onExit={onExit}>
        <p>done</p>
      </FocusLayout>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('opens the confirmation with Esc', () => {
    renderWithIntl(
      <FocusLayout progress={{ current: 1, total: 3 }} confirmExit onExit={vi.fn()}>
        <p>exercise</p>
      </FocusLayout>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('useExerciseShortcuts', () => {
  // Review Focus 2: typing in an input never triggers a shortcut.
  it('maps 1–4 and Enter, but not while typing in an input', () => {
    const onPick = vi.fn();
    const onEnter = vi.fn();
    renderWithIntl(<Shortcuts onPick={onPick} onEnter={onEnter} />);
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Your answer'), { key: '3' });
    fireEvent.keyDown(screen.getByLabelText('Your answer'), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('ignores a held key, and any shortcut while the exit dialog is open', () => {
    const onPick = vi.fn();
    const onEnter = vi.fn();
    renderWithIntl(
      <FocusLayout progress={{ current: 1, total: 3 }} confirmExit onExit={vi.fn()}>
        <Shortcuts onPick={onPick} onEnter={onEnter} />
      </FocusLayout>
    );
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    fireEvent.keyDown(document.body, { key: '1', repeat: true });
    expect(onEnter).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(onEnter).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('does not treat Esc in a text field as leaving, so a draft is kept', () => {
    const onExit = vi.fn();
    renderWithIntl(
      <FocusLayout progress={{ current: 1, total: 3 }} confirmExit={false} onExit={onExit}>
        <Shortcuts onPick={vi.fn()} onEnter={vi.fn()} />
      </FocusLayout>
    );
    const field = screen.getByLabelText('Your answer');
    fireEvent.change(field, { target: { value: 'mein Entwurf' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(field).toHaveValue('mein Entwurf');
  });

  // Final review M2: new handler closures each render must not re-subscribe the listener.
  it('subscribes the shortcut listener once across re-renders and still calls the latest handler', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderWithIntl(<Shortcuts onPick={first} onEnter={() => {}} />);
    rerender(<Shortcuts onPick={() => first(0)} onEnter={() => {}} />);
    rerender(<Shortcuts onPick={latest} onEnter={() => {}} />);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: '2' });
    expect(latest).toHaveBeenCalledWith(1);
    expect(first).not.toHaveBeenCalled();
    add.mockRestore();
  });
});
