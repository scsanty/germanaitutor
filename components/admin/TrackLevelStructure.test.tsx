import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackLevelStructure } from './TrackLevelStructure';

const structure = [
  {
    milestone: { id: 'm1', title: 'Milestone 1' },
    sections: [{ section: { id: 's1', title: 'Section 1' }, lessons: [{ id: 'a1-l1', title: 'Lesson 1' }] }],
  },
  {
    milestone: { id: 'generic-a1-unsorted', title: 'Unsorted' },
    sections: [{ section: { id: 'generic-a1-unsorted-section', title: 'Unsorted' }, lessons: [] }],
  },
];

describe('TrackLevelStructure', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockResolvedValue({ ok: true, json: async () => structure });
  });

  it('renders milestones and sections, excluding management controls on Unsorted', async () => {
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    expect(screen.getByText('Delete milestone')).toBeInTheDocument();
    // Unsorted's own heading renders, but with no management controls next to it —
    // only one "Delete milestone" button exists (for the real milestone).
    expect(screen.getAllByText('Delete milestone')).toHaveLength(1);
  });

  it('creates a milestone', async () => {
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Milestone 2' } });
    fireEvent.click(screen.getByText('Add milestone'));
    await waitFor(() => {
      const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones');
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall[1].body)).toEqual({ track: 'generic', level: 'A1', title: 'Milestone 2', description: null });
    });
  });

  it('confirms with the affected lesson names before deleting a milestone', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete milestone'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Lesson 1'));
    await waitFor(() => {
      const deleteCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones/m1');
      expect(deleteCall[1].method).toBe('DELETE');
    });
  });

  it('does not delete when the confirm is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete milestone'));
    const deleteCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones/m1');
    expect(deleteCall).toBeUndefined();
  });

  it('moving a milestone down sends the swapped order to the reorder endpoint', async () => {
    const twoMilestones = [
      { milestone: { id: 'm1', title: 'M1' }, sections: [] },
      { milestone: { id: 'm2', title: 'M2' }, sections: [] },
      { milestone: { id: 'generic-a1-unsorted', title: 'Unsorted' }, sections: [] },
    ];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => twoMilestones });
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('M1')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Move milestone down')[0]);
    await waitFor(() => {
      const reorderCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones/reorder');
      expect(JSON.parse(reorderCall[1].body)).toEqual({ track: 'generic', level: 'A1', orderedIds: ['m2', 'm1'] });
    });
  });

  it('surfaces an error when renaming a milestone fails', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('New Title');
    (fetch as any).mockImplementation((url: string) => {
      if (url === '/api/admin/curriculum/milestones/m1') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Title already in use' }) });
      }
      return Promise.resolve({ ok: true, json: async () => structure });
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Rename milestone'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Title already in use');
    });
  });

  it('creates a section under a milestone', async () => {
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('New section title in Milestone 1'), { target: { value: 'Section 2' } });
    fireEvent.click(screen.getByText('Add section'));
    await waitFor(() => {
      const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/sections');
      expect(JSON.parse(postCall[1].body)).toEqual({ milestoneId: 'm1', title: 'Section 2', description: null });
    });
  });
});
