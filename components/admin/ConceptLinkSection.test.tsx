import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConceptLinkSection } from './ConceptLinkSection';

const telcStructure = [{ lessons: [{ id: 't1', title: 'T1', track: 'telc' }] }];
const goetheStructure = [{ lessons: [] }];

describe('ConceptLinkSection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes('/tracks/telc/')) return Promise.resolve({ ok: true, json: async () => telcStructure });
      if (url.includes('/tracks/goethe/')) return Promise.resolve({ ok: true, json: async () => goetheStructure });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
  });

  it('fetches candidates from the other two tracks at the same level', async () => {
    render(
      <ConceptLinkSection lessonId="g1" track="generic" sourceLevel="A1" links={[]} onLinksChange={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('telc: T1')).toBeInTheDocument());
  });

  it('excludes already-linked lessons from the candidate list but still shows them as a current link', async () => {
    render(
      <ConceptLinkSection
        lessonId="g1"
        track="generic"
        sourceLevel="A1"
        links={[{ id: 't1', title: 'T1', track: 'telc' }]}
        onLinksChange={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByRole('listitem')).toHaveTextContent('telc: T1'));
    expect(screen.queryByRole('option', { name: 'telc: T1' })).not.toBeInTheDocument();
  });

  it('adding a link posts to the API and calls onLinksChange', async () => {
    const onLinksChange = vi.fn();
    render(
      <ConceptLinkSection lessonId="g1" track="generic" sourceLevel="A1" links={[]} onLinksChange={onLinksChange} />
    );
    await waitFor(() => expect(screen.getByText('telc: T1')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Add link'), { target: { value: 't1' } });
    fireEvent.click(screen.getByText('Add link', { selector: 'button' }));
    await waitFor(() =>
      expect(onLinksChange).toHaveBeenCalledWith([{ id: 't1', title: 'T1', track: 'telc' }])
    );
    const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons/g1/links');
    expect(JSON.parse(postCall[1].body)).toEqual({ otherLessonId: 't1' });
  });

  it('removing a link calls DELETE and calls onLinksChange', async () => {
    const onLinksChange = vi.fn();
    render(
      <ConceptLinkSection
        lessonId="g1"
        track="generic"
        sourceLevel="A1"
        links={[{ id: 't1', title: 'T1', track: 'telc' }]}
        onLinksChange={onLinksChange}
      />
    );
    fireEvent.click(screen.getByText('Unlink'));
    await waitFor(() => expect(onLinksChange).toHaveBeenCalledWith([]));
    const deleteCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[0] === '/api/admin/curriculum/lessons/g1/links/t1'
    );
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('surfaces an error instead of optimistically removing the link when the DELETE fails', async () => {
    const onLinksChange = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes('/tracks/telc/')) return Promise.resolve({ ok: true, json: async () => telcStructure });
      if (url.includes('/tracks/goethe/')) return Promise.resolve({ ok: true, json: async () => goetheStructure });
      if (url === '/api/admin/curriculum/lessons/g1/links/t1') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Link not found' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(
      <ConceptLinkSection
        lessonId="g1"
        track="generic"
        sourceLevel="A1"
        links={[{ id: 't1', title: 'T1', track: 'telc' }]}
        onLinksChange={onLinksChange}
      />
    );
    fireEvent.click(screen.getByText('Unlink'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Link not found'));
    expect(onLinksChange).not.toHaveBeenCalled();
  });

  it('shows an alert when the candidate lessons cannot load', async () => {
    (fetch as any).mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }));
    render(
      <ConceptLinkSection lessonId="g1" track="generic" sourceLevel="A1" links={[]} onLinksChange={vi.fn()} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load link candidates');
  });
});
