import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonEditorForm } from './LessonEditorForm';

const trackStructureResponse = [
  {
    milestone: { id: 'm1', title: 'Milestone 1', titleDe: 'Meilenstein 1', description: null, difficultyRank: 1 },
    lessons: [{ id: 'a1-other', title: 'Other Lesson' }],
  },
  {
    milestone: { id: 'generic-a1-unsorted', title: 'Unsorted', description: null, difficultyRank: null },
    lessons: [],
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
    expect(await screen.findByText('1. Milestone 1')).toBeInTheDocument();
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
          titleDe: 'Andere Lektion',
          explanation: null,
          explanationDe: null,
          examples: null,
          examplesDe: null,
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
    await screen.findByRole('option', { name: '1. Milestone 1' });

    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 'new-lesson' } });
    fireEvent.change(screen.getByLabelText('Title (English)'), { target: { value: 'New Lesson' } });
    fireEvent.change(screen.getByLabelText('Title (German)'), { target: { value: 'Neue Lektion' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'a1-new-lesson', title: 'New Lesson' }));
    const createCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons');
    expect(createCall[1].method).toBe('POST');
    const body = JSON.parse(createCall[1].body);
    expect(body).toMatchObject({
      slug: 'new-lesson',
      title: 'New Lesson',
      titleDe: 'Neue Lektion',
      explanation: null,
      explanationDe: null,
      examples: null,
      examplesDe: null,
      placement: { milestoneId: 'm1' },
    });
  });

  it('shows an error and does not call onSaved when the save request fails', async () => {
    const onSaved = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/curriculum/tracks')) return Promise.resolve({ ok: true, json: async () => trackStructureResponse });
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Duplicate id' }) });
    });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={onSaved} />);
    await screen.findByRole('option', { name: '1. Milestone 1' });

    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 'new-lesson' } });
    fireEvent.change(screen.getByLabelText('Title (English)'), { target: { value: 'New Lesson' } });
    fireEvent.change(screen.getByLabelText('Title (German)'), { target: { value: 'Neue Lektion' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
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
    await screen.findByRole('option', { name: '1. Milestone 1' });

    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    await waitFor(() => expect(screen.getByText('Save')).not.toBeDisabled());

    fireEvent.change(screen.getByLabelText('Track'), { target: { value: 'telc' } });
    await waitFor(() => expect(screen.getByText('Save')).toBeDisabled());
    // The picker itself must also reset its own internal milestone selection — not
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
          titleDe: 'Bearbeitete Lektion',
          explanation: null,
          explanationDe: null,
          examples: null,
          examplesDe: null,
          exercises: [],
          prerequisiteIds: ['a1-other'],
        }}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText('Prerequisites')).toBeInTheDocument());
    expect(screen.getByLabelText('Other Lesson')).toBeChecked();
  });

  it('shows an alert when the track structure cannot load', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the track structure');
  });

  it('sends both languages of the explanation and every example', async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/curriculum/tracks')) return Promise.resolve({ ok: true, json: async () => trackStructureResponse });
      return Promise.resolve({ ok: true, json: async () => ({ id: 'a1-new-lesson' }) });
    });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1. Milestone 1' });

    fireEvent.change(screen.getByLabelText('Title (English)'), { target: { value: 'T' } });
    fireEvent.change(screen.getByLabelText('Title (German)'), { target: { value: 'T-de' } });
    fireEvent.change(screen.getByLabelText('Explanation (English)'), { target: { value: 'E' } });
    fireEvent.change(screen.getByLabelText('Explanation (German)'), { target: { value: 'E-de' } });
    fireEvent.click(screen.getByText('Add example'));
    fireEvent.change(screen.getByLabelText('Example 1 (English)'), { target: { value: 'Ex' } });
    fireEvent.change(screen.getByLabelText('Example 1 (German)'), { target: { value: 'Bsp' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 's' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect((fetch as any).mock.calls.some((c: any[]) => c[0] === '/api/admin/curriculum/lessons')).toBe(true));
    const call = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons');
    expect(JSON.parse(call[1].body)).toMatchObject({
      explanation: 'E',
      explanationDe: 'E-de',
      examples: ['Ex'],
      examplesDe: ['Bsp'],
    });
  });
});
