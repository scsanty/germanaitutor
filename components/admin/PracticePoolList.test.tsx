import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { PracticePoolList } from './PracticePoolList';

const ITEM = {
  id: 'px-1',
  lessonId: 'a1-greet',
  lessonTitle: 'Saying hello',
  track: 'generic',
  level: 'A1',
  type: 'multiple_choice',
  content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 },
  correctAnswer: 'Tschüss',
  reviewStatus: 'unreviewed',
  createdAt: '2026-09-29T10:00:00.000Z',
  reviewedAt: null,
};

function stubFetch(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected fetch: ${key}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PracticePoolList', () => {
  it('lists unreviewed exercises and approves one', async () => {
    const lists = [() => delayedResponse([ITEM]), () => delayedResponse([])];
    const fetchMock = stubFetch({
      'GET /api/admin/practice?status=unreviewed': () => lists.shift()!(),
      'PATCH /api/admin/practice/px-1': () => delayedResponse({ ...ITEM, reviewStatus: 'approved' }),
    });
    render(<PracticePoolList status="unreviewed" />);
    expect(await screen.findByText('Bye? (Tschüss | Hallo)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/admin/curriculum/lesson/a1-greet?track=generic');
    expect(screen.getByText('Answer: Tschüss')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/practice/px-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
  });

  it('edits content inline and saves it', async () => {
    const fetchMock = stubFetch({
      'GET /api/admin/practice?lessonId=a1-greet': () => delayedResponse([ITEM]),
      'PATCH /api/admin/practice/px-1': () => delayedResponse({ ...ITEM, reviewStatus: 'approved' }),
    });
    render(<PracticePoolList lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Exercise 1 question'), { target: { value: 'Goodbye?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/practice/px-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { question: 'Goodbye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } }),
      })
    );
  });

  it('offers no instruction fields when editing pool content', async () => {
    stubFetch({ 'GET /api/admin/practice?lessonId=a1-greet': () => delayedResponse([ITEM]) });
    render(<PracticePoolList lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Exercise 1 question')).toBeInTheDocument();
    expect(screen.queryByLabelText(/instruction/i)).not.toBeInTheDocument();
  });

  it('promotes, and shows a server refusal', async () => {
    stubFetch({
      'GET /api/admin/practice?status=unreviewed': () => delayedResponse([ITEM]),
      'POST /api/admin/practice/px-1/promote': () =>
        delayedResponse({ error: 'This lesson has 1 flashcard, which is only allowed in vocabulary lessons.' }, { ok: false, status: 400 }),
    });
    render(<PracticePoolList status="unreviewed" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Promote into the lesson' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This lesson has 1 flashcard');
  });

  it('filters by track and level', async () => {
    const fetchMock = stubFetch({
      'GET /api/admin/practice?status=unreviewed': () => delayedResponse([]),
      'GET /api/admin/practice?status=unreviewed&track=goethe': () => delayedResponse([]),
      'GET /api/admin/practice?status=unreviewed&track=goethe&level=B1': () => delayedResponse([]),
    });
    render(<PracticePoolList status="unreviewed" showFilters />);
    await screen.findByText('Nothing here.');
    fireEvent.change(screen.getByLabelText('Track'), { target: { value: 'goethe' } });
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'B1' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/practice?status=unreviewed&track=goethe&level=B1')
    );
  });

  it('shows an error when the list cannot load', async () => {
    stubFetch({ 'GET /api/admin/practice?status=unreviewed': () => delayedResponse({}, { ok: false, status: 500 }) });
    render(<PracticePoolList status="unreviewed" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load practice exercises');
  });
});
