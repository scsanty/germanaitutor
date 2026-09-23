import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlacementPicker, type PlacementMilestoneOption } from './PlacementPicker';

const milestones: PlacementMilestoneOption[] = [
  { id: 'm1', title: 'Milestone 1', sections: [{ id: 's1', title: 'Section 1' }] },
];

describe('PlacementPicker', () => {
  it('emits null before any milestone is chosen', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalledWith(expect.anything());
  });

  it('selecting an existing section emits {sectionId}', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    expect(onChange).toHaveBeenLastCalledWith({ sectionId: 's1' });
  });

  it('emits null while an existing milestone is chosen but no section yet', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('a new section under an existing milestone emits {milestoneId, newSectionTitle} once titled', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: '__new__' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New section title'), { target: { value: 'Fresh Section' } });
    expect(onChange).toHaveBeenLastCalledWith({ milestoneId: 'm1', newSectionTitle: 'Fresh Section' });
  });

  it('a new milestone emits {newMilestoneTitle, newSectionTitle} once both are titled', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Fresh Milestone' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New section title'), { target: { value: 'Fresh Section' } });
    expect(onChange).toHaveBeenLastCalledWith({ newMilestoneTitle: 'Fresh Milestone', newSectionTitle: 'Fresh Section' });
  });
});
