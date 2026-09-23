import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PrerequisitePicker } from './PrerequisitePicker';

describe('PrerequisitePicker', () => {
  it('shows a message when there are no candidates', () => {
    render(<PrerequisitePicker candidates={[]} selectedIds={[]} onChange={vi.fn()} />);
    expect(screen.getByText('No other lessons in this track/level yet.')).toBeInTheDocument();
  });

  it('renders a checkbox per candidate, checked for already-selected ids', () => {
    render(
      <PrerequisitePicker
        candidates={[
          { id: 'a1-basics', title: 'Basics' },
          { id: 'a1-advanced', title: 'Advanced' },
        ]}
        selectedIds={['a1-basics']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Basics')).toBeChecked();
    expect(screen.getByLabelText('Advanced')).not.toBeChecked();
  });

  it('checking a box adds its id', () => {
    const onChange = vi.fn();
    render(
      <PrerequisitePicker candidates={[{ id: 'a1-basics', title: 'Basics' }]} selectedIds={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Basics'));
    expect(onChange).toHaveBeenCalledWith(['a1-basics']);
  });

  it('unchecking a box removes its id', () => {
    const onChange = vi.fn();
    render(
      <PrerequisitePicker
        candidates={[{ id: 'a1-basics', title: 'Basics' }]}
        selectedIds={['a1-basics']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Basics'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
