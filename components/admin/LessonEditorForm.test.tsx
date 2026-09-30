import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonEditorForm } from './LessonEditorForm';

const trackStructureResponse = [
  {
    milestone: { id: 'm1', title: 'Milestone 1' },
    sections: [{ section: { id: 's1', title: 'Section 1' }, lessons: [{ id: 'a1-other', title: 'Other Lesson' }] }],
  },
  {
    milestone: { id: 'generic-a1-unsorted', title: 'Unsorted' },
    sections: [{ section: { id: 'generic-a1-unsorted-section', title: 'Unsorted' }, lessons: [] }],
  },
];

describe('LessonEditorForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockResolvedValue({ ok: true, json: async () => trackStructureResponse });
  });

  it('fetches the track structure and excludes Unsorted from the milestone picker', async () => {
    render(
      <LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />
    );
    // The Milestone select renders before the fetch resolves, so wait for its options.
    expect(await screen.findByText('Milestone 1')).toBeInTheDocument();
    expect(screen.queryByText('Unsorted')).not.toBeInTheDocument();
  });

  it('excludes the lesson being edited from its own prerequisite candidates', async () => {
    render(
      <LessonEditorForm
        mode="edit"
        lessonId="a1-other"
        initial={{
          slug: 'other',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Other Lesson',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
        }}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText('Prerequisites')).toBeInTheDocument());
    expect(screen.queryByLabelText('Other Lesson')).not.toBeInTheDocument();
  });

  it('submits a create request with the form body and calls onSaved', async () => {
    const onSaved = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/curriculum/tracks')) return Promise.resolve({ ok: true, json: async () => trackStructureResponse });
      return Promise.resolve({ ok: true, json: async () => ({ id: 'a1-new-lesson', title: 'New Lesson' }) });
    });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={onSaved} />);
    await screen.findByRole('option', { name: 'Milestone 1' });

    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 'new-lesson' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'New Lesson' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'a1-new-lesson', title: 'New Lesson' }));
    const createCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons');
    expect(createCall[1].method).toBe('POST');
    const body = JSON.parse(createCall[1].body);
    expect(body).toMatchObject({ slug: 'new-lesson', title: 'New Lesson', placement: { sectionId: 's1' } });
  });

  it('shows an error and does not call onSaved when the save request fails', async () => {
    const onSaved = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/curriculum/tracks')) return Promise.resolve({ ok: true, json: async () => trackStructureResponse });
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Duplicate id' }) });
    });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={onSaved} />);
    await screen.findByRole('option', { name: 'Milestone 1' });

    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 'new-lesson' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'New Lesson' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Duplicate id'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables Save while no placement is chosen', async () => {
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Milestone')).toBeInTheDocument());
    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('changing track after selecting a placement clears it and disables Save again', async () => {
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: 'Milestone 1' });

    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByText('Save')).not.toBeDisabled());

    fireEvent.change(screen.getByLabelText('Track'), { target: { value: 'telc' } });
    await waitFor(() => expect(screen.getByText('Save')).toBeDisabled());
    // The picker itself must also reset its own internal milestone/section selection — not
    // just the emitted value — since it remounts fresh (key={track}-{sourceLevel}).
    expect((screen.getByLabelText('Milestone') as HTMLSelectElement).value).toBe('');
  });

  it('preserves the initially-loaded prerequisites on mount in edit mode (the track/level reset only fires on an actual change)', async () => {
    render(
      <LessonEditorForm
        mode="edit"
        lessonId="a1-edited"
        initial={{
          slug: 'edited',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Edited Lesson',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: ['a1-other'],
        }}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText('Prerequisites')).toBeInTheDocument());
    expect(screen.getByLabelText('Other Lesson')).toBeChecked();
  });
});
