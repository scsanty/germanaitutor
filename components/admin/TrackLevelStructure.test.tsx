import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { TrackLevelStructure } from './TrackLevelStructure';

vi.mock('./DependencyDiagram', () => ({ DependencyDiagram: () => <p>diagram</p> }));

const STRUCTURE = [
  { milestone: { id: 'm1', title: 'Basics', description: null, difficultyRank: 1 }, lessons: [{ id: 'a1-greet', title: 'Saying hello' }] },
  { milestone: { id: 'generic-a1-unsorted', title: 'Unsorted', description: null, difficultyRank: null }, lessons: [] },
];

function stub(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!routes[key]) throw new Error(`Unexpected fetch: ${key}`);
    return routes[key](init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TrackLevelStructure', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists milestones by rank with their lessons, and Unsorted without controls', async () => {
    stub({ 'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE) });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByRole('heading', { name: '1. Basics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/admin/curriculum/lesson/a1-greet?track=generic');
    expect(screen.getByRole('heading', { name: 'Unsorted' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete milestone' })).toHaveLength(1);
  });

  it('creates a milestone with a rank', async () => {
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE),
      'POST /api/admin/curriculum/milestones': () => delayedResponse({ id: 'm2' }, { status: 201 }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    await screen.findByRole('heading', { name: '1. Basics' });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Past' } });
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Past', description: null, difficultyRank: 2 }),
      })
    );
  });

  it('saves a rank change and shows a server refusal', async () => {
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE),
      'PATCH /api/admin/curriculum/milestones/m1': () =>
        delayedResponse({ error: 'Difficulty rank must be a whole number of 1 or more' }, { ok: false, status: 400 }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    const rank = await screen.findByLabelText('Rank of Basics');
    fireEvent.change(rank, { target: { value: '0' } });
    fireEvent.blur(rank);
    expect(await screen.findByRole('alert')).toHaveTextContent('Difficulty rank must be a whole number of 1 or more');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/milestones/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Basics', description: null, difficultyRank: 0 }),
    });
  });

  it('shows an error when the structure cannot load', async () => {
    stub({ 'GET /api/curriculum/tracks/generic/A1': () => delayedResponse({}, { ok: false, status: 500 }) });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load structure');
  });
});
