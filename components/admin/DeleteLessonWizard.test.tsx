import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteLessonWizard } from './DeleteLessonWizard';

function previewFor(id: string, linkedLessons: { id: string; title: string; track: string }[]) {
  return { lessonId: id, repair: { edgesToAdd: [], edgesToRemove: [], skippedBridges: [] }, linkedLessons };
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

  it('processes two accepted linked-lesson offers strictly one at a time under real network latency, never concurrently dequeuing a second lesson before the first\'s own preview has resolved', async () => {
    // Regression test for the race where the advance-effect's synchronous `setQueue(rest)`
    // dequeue, followed by a re-render before the async fetch resolves, let the effect fire
    // again and dequeue a second queued lesson concurrently — clobbering the first lesson's
    // own preview before its cascade offers could ever be shown. A microtask-resolving mock
    // (mockResolvedValue, used by the other tests here) happens to resolve before React
    // re-renders, so it can't exercise this window; a macrotask delay (setTimeout) can.
    const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    (fetch as any).mockImplementation(async (url: string) => {
      await delay();
      if (url.endsWith('/lessons/b/delete-preview'))
        return {
          ok: true,
          json: async () =>
            previewFor('b', [
              { id: 'd', title: 'D', track: 'telc' },
              { id: 'e', title: 'E', track: 'goethe' },
            ]),
        };
      if (url.endsWith('/lessons/d/delete-preview'))
        return { ok: true, json: async () => previewFor('d', [{ id: 'x', title: 'X', track: 'telc' }]) };
      if (url.endsWith('/lessons/e/delete-preview'))
        return { ok: true, json: async () => previewFor('e', [{ id: 'y', title: 'Y', track: 'goethe' }]) };
      return { ok: true, json: async () => ({ ok: true }) };
    });

    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete')); // accept D
    await waitFor(() => expect(screen.getByText('goethe: E')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete')); // accept E — queue is now [d, e]

    // D's own preview (and its own cascade offer, X) must appear on its own — proving D was
    // dequeued and fetched by itself, not concurrently with E.
    await waitFor(() => expect(screen.getByText('telc: X')).toBeInTheDocument());
    expect(
      (fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith('/lessons/e/delete-preview'))
    ).toBe(false);
    fireEvent.click(screen.getByText('Leave it')); // decline X

    // Only once D's own preview cycle is fully resolved does E's own preview get fetched.
    await waitFor(() => expect(screen.getByText('goethe: Y')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Leave it')); // decline Y

    await waitFor(() => expect(screen.getByText('Ready to delete 3 lesson(s)')).toBeInTheDocument());
    const previewCalls = (fetch as any).mock.calls
      .filter((c: any[]) => String(c[0]).includes('delete-preview'))
      .map((c: any[]) => String(c[0]));
    // Exactly b, d, e — in that order, one after another. X and Y were declined so their own
    // previews are never fetched at all.
    expect(previewCalls).toEqual([
      '/api/admin/curriculum/lessons/b/delete-preview',
      '/api/admin/curriculum/lessons/d/delete-preview',
      '/api/admin/curriculum/lessons/e/delete-preview',
    ]);
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
