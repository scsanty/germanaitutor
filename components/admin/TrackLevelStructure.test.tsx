import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { TrackLevelStructure } from './TrackLevelStructure';

vi.mock('./DependencyDiagram', () => ({ DependencyDiagram: () => <p>diagram</p> }));

const STRUCTURE = [
  { milestone: { id: 'm1', title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 1 }, lessons: [{ id: 'a1-greet', title: 'Saying hello' }], lessonsBuildingOnUnsorted: [] },
  { milestone: { id: 'generic-a1-unsorted', title: 'Unsorted', titleDe: 'Unsortiert', description: null, descriptionDe: null, difficultyRank: null }, lessons: [], lessonsBuildingOnUnsorted: [] },
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
  it('lists milestones by rank with their lessons, and Unsorted without controls', async () => {
    stub({ 'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE) });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByRole('heading', { name: '1. Basics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/admin/curriculum/lesson/a1-greet?track=generic');
    expect(screen.getByRole('heading', { name: 'Unsorted' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete milestone' })).toHaveLength(1);
  });

  it('moves a lesson with "Move to…" and flags lessons building on Unsorted', async () => {
    const withFlag = [
      { ...STRUCTURE[0], lessonsBuildingOnUnsorted: ['a1-greet'] },
      { milestone: { id: 'm2', title: 'Past', titleDe: 'Vergangenheit', description: null, descriptionDe: null, difficultyRank: 2 }, lessons: [], lessonsBuildingOnUnsorted: [] },
      { ...STRUCTURE[1], lessonsBuildingOnUnsorted: [] },
    ];
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(withFlag),
      'PATCH /api/admin/curriculum/lessons/a1-greet/milestone': () => delayedResponse({ ok: true }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByText('builds on a lesson in Unsorted')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Move Saying hello to'), { target: { value: 'm2' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/lessons/a1-greet/milestone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId: 'm2' }),
      })
    );
  });

  it('creates a milestone with a rank', async () => {
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE),
      'POST /api/admin/curriculum/milestones': () => delayedResponse({ id: 'm2' }, { status: 201 }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    await screen.findByRole('heading', { name: '1. Basics' });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Past' } });
    fireEvent.change(screen.getByLabelText('New milestone German title'), { target: { value: 'Vergangenheit' } });
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Past', titleDe: 'Vergangenheit', description: null, descriptionDe: null, difficultyRank: 2 }),
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
      body: JSON.stringify({ title: 'Basics', titleDe: 'Grundlagen', description: null, descriptionDe: null, difficultyRank: 0 }),
    });
  });

  it('shows an error when the structure cannot load', async () => {
    stub({ 'GET /api/curriculum/tracks/generic/A1': () => delayedResponse({}, { ok: false, status: 500 }) });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load structure');
  });

  it('deletes a milestone only after the dialog is confirmed', async () => {
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE),
      'DELETE /api/admin/curriculum/milestones/m1': () => delayedResponse({ ok: true }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete milestone' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('1 lesson(s) will move to Unsorted: Saying hello');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/curriculum/milestones/m1', { method: 'DELETE' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/milestones/m1', { method: 'DELETE' }));
  });
});
