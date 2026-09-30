import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlacementPicker } from './PlacementPicker';

const MILESTONES = [
  { id: 'm1', title: 'Basics', difficultyRank: 1 },
  { id: 'm2', title: 'Past', difficultyRank: 2 },
];

describe('PlacementPicker', () => {
  it('emits the chosen milestone', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={MILESTONES} onChange={onChange} />);
    expect(screen.getByRole('option', { name: '2. Past' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm2' } });
    expect(onChange).toHaveBeenLastCalledWith({ milestoneId: 'm2' });
  });

  it('emits a new milestone only once it has both titles and a whole-number rank of 1 or more', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={MILESTONES} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Later' } });
    fireEvent.change(screen.getByLabelText('New milestone German title'), { target: { value: 'Später' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ newMilestoneTitle: 'Later', newMilestoneTitleDe: 'Später', newMilestoneRank: 3 });
  });

  it('emits null when the choice is cleared', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={MILESTONES} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
