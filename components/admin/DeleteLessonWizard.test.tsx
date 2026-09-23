import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteLessonWizard } from './DeleteLessonWizard';

function previewFor(id: string, linkedLessons: { id: string; title: string; track: string }[]) {
  return { lessonId: id, repair: { edgesToAdd: [], edgesToRemove: [] }, linkedLessons };
}

describe('DeleteLessonWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the root lesson repair preview and its directly-linked lessons as offers', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => previewFor('b', [{ id: 'd', title: 'D', track: 'telc' }]),
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
  });

  it('accepting an offer adds it to the set and fetches its own preview next', async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.endsWith('/lessons/b/delete-preview'))
        return Promise.resolve({ ok: true, json: async () => previewFor('b', [{ id: 'd', title: 'D', track: 'telc' }]) });
      if (url.endsWith('/lessons/d/delete-preview'))
        return Promise.resolve({ ok: true, json: async () => previewFor('d', []) });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete'));
    await waitFor(() => expect(screen.getByText('Ready to delete 2 lesson(s)')).toBeInTheDocument());
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
  });

  it('declining an offer leaves it out of the set entirely', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => previewFor('b', [{ id: 'd', title: 'D', track: 'telc' }]),
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Leave it'));
    await waitFor(() => expect(screen.getByText('Ready to delete 1 lesson(s)')).toBeInTheDocument());
    expect(screen.queryByText('d')).not.toBeInTheDocument();
  });

  it('never re-offers a lesson already decided, walking a B↔D, D↔F, F↔B triangle exactly once each', async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.endsWith('/lessons/b/delete-preview'))
        return Promise.resolve({
          ok: true,
          json: async () =>
            previewFor('b', [
              { id: 'd', title: 'D', track: 'telc' },
              { id: 'f', title: 'F', track: 'goethe' },
            ]),
        });
      if (url.endsWith('/lessons/d/delete-preview'))
        return Promise.resolve({
          ok: true,
          json: async () =>
            previewFor('d', [
              { id: 'b', title: 'B', track: 'generic' },
              { id: 'f', title: 'F', track: 'goethe' },
            ]),
        });
      if (url.endsWith('/lessons/f/delete-preview'))
        return Promise.resolve({
          ok: true,
          json: async () =>
            previewFor('f', [
              { id: 'd', title: 'D', track: 'telc' },
              { id: 'b', title: 'B', track: 'generic' },
            ]),
        });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete')); // accept D
    await waitFor(() => expect(screen.getByText('goethe: F')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete')); // accept F

    await waitFor(() => expect(screen.getByText('Ready to delete 3 lesson(s)')).toBeInTheDocument());
    const previewCalls = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('delete-preview'));
    expect(previewCalls).toHaveLength(3); // b, d, f — each fetched exactly once, never re-offered
  });

  it('surfaces an error instead of silently showing empty effects when the preview fetch fails, blocking with Cancel-only (no Delete All) even for the single/last item in the queue', async () => {
    // Root lesson is the only item in the queue (queue starts and ends as ['b']) — the most
    // common failure shape, e.g. a root-lesson-not-found delete. `setQueue(rest)` pops the
    // queue to [] synchronously before this rejection resolves, so `isDone`
    // (currentPreview === null && queue.length === 0) is already true by the time the error
    // is recorded. The fix must still render the blocking Cancel-only screen here rather than
    // falling through to the "Ready to delete" screen with an enabled Delete All button.
    (fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Lesson not found' }),
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Lesson not found'));
    expect(screen.queryByText('Repair effects')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete All')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ready to delete/)).not.toBeInTheDocument();
  });

  it('Delete All sends the accumulated set and calls onDeleted', async () => {
    const onDeleted = vi.fn();
    (fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/lessons/b/delete-preview')) return Promise.resolve({ ok: true, json: async () => previewFor('b', []) });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByText('Ready to delete 1 lesson(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete All'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    const deleteCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons');
    expect(deleteCall[1].method).toBe('DELETE');
    expect(JSON.parse(deleteCall[1].body)).toEqual({ lessonIds: ['b'] });
  });
});
