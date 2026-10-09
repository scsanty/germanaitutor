import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { ExamPracticeAdmin, type ExamPracticeFormatOption } from './ExamPracticeAdmin';

const FORMATS: ExamPracticeFormatOption[] = [
  {
    id: 'telc-b1',
    name: 'telc Deutsch B1',
    parts: [
      { id: 'lesen-1', title: 'Leseverstehen Teil 1 (Reading Part 1)', taskType: 'matching', items: 2 },
      { id: 'lesen-2', title: 'Leseverstehen Teil 2 (Reading Part 2)', taskType: 'passage_questions', items: 2 },
    ],
  },
];

const SET = {
  taskType: 'matching',
  content: { items: ['Text eins', 'Text zwei'], targets: ['A', 'B', 'C'], answers: [0, 1], allowNone: false },
  explanations: [
    { en: 'One', de: 'Eins' },
    { en: 'Two', de: 'Zwei' },
  ],
};
const row = (id: string, status: string) => ({ id, formatId: 'telc-b1', partId: 'lesen-1', status, itemCount: 2, createdAt: '2026-10-01T10:00:00.000Z', reviewedAt: null, set: SET });
const STARTER = row('telc-b1__lesen-1__s01', 'starter');
const POOL = row('telc-b1__lesen-1__pabc', 'unreviewed');
const LIST = 'GET /api/admin/exam-practice?formatId=telc-b1&partId=lesen-1';

function stubFetch(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const rowOf = (id: string) => screen.getByText(id).closest('tr')!;

describe('ExamPracticeAdmin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the sets with their statuses and approves one', async () => {
    const lists = [() => delayedResponse([STARTER, POOL]), () => delayedResponse([STARTER, { ...POOL, status: 'approved' }])];
    const fetchMock = stubFetch({
      [LIST]: () => lists.shift()!(),
      [`PATCH /api/admin/exam-practice/${POOL.id}`]: () => delayedResponse({ ok: true }),
    });
    render(<ExamPracticeAdmin formats={FORMATS} />);
    expect(await screen.findByText(STARTER.id)).toBeInTheDocument();
    expect(within(rowOf(STARTER.id)).getByText('starter')).toBeInTheDocument();
    expect(within(rowOf(POOL.id)).getByText('unreviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve' })).not.toBeInTheDocument();

    fireEvent.click(within(rowOf(POOL.id)).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(within(rowOf(POOL.id)).getByText('approved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/exam-practice/${POOL.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
  });

  it('offers downloads for the chosen part and reloads when the part changes', async () => {
    const fetchMock = stubFetch({
      [LIST]: () => delayedResponse([STARTER]),
      'GET /api/admin/exam-practice?formatId=telc-b1&partId=lesen-2': () => delayedResponse([]),
    });
    render(<ExamPracticeAdmin formats={FORMATS} />);
    await screen.findByText(STARTER.id);
    expect(screen.getByRole('link', { name: 'Download YAML' })).toHaveAttribute('href', '/api/admin/exam-practice/export?formatId=telc-b1&partId=lesen-1&format=yaml');
    fireEvent.change(screen.getByLabelText('Part'), { target: { value: 'lesen-2' } });
    expect(await screen.findByText('No sets for this part yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download JSON' })).toHaveAttribute('href', '/api/admin/exam-practice/export?formatId=telc-b1&partId=lesen-2&format=json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an upload error from the server in an alert', async () => {
    const fetchMock = stubFetch({
      [LIST]: () => delayedResponse([STARTER]),
      'PUT /api/admin/exam-practice': () => delayedResponse({ error: 'bad-1: the part needs matching, not cloze', code: 'bad_request' }, { ok: false, status: 400 }),
    });
    render(<ExamPracticeAdmin formats={FORMATS} />);
    await screen.findByText(STARTER.id);
    const file = new File(['sets: []'], 'sets.yaml', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Teil set file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('bad-1: the part needs matching, not cloze'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/exam-practice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formatId: 'telc-b1', partId: 'lesen-1', format: 'yaml', text: 'sets: []' }),
    });
  });

  it('edits a set without instruction fields and saves content plus explanations', async () => {
    const fetchMock = stubFetch({
      [LIST]: () => delayedResponse([STARTER]),
      [`PATCH /api/admin/exam-practice/${STARTER.id}`]: () => delayedResponse({ error: '2 items need 2 explanations, found 1' }, { ok: false, status: 400 }),
    });
    render(<ExamPracticeAdmin formats={FORMATS} />);
    await screen.findByText(STARTER.id);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText(/instruction/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Item 2 explanation (German)'), { target: { value: 'Zwei!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('2 items need 2 explanations, found 1'));
    const body = JSON.parse(String(fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')![1]!.body));
    expect(body.set.explanations[1]).toEqual({ en: 'Two', de: 'Zwei!' });
    expect(body.set.content).toEqual(SET.content);
  });

  it('duplicates a set and opens the copy in the editor', async () => {
    const copy = row('telc-b1__lesen-1__pnew', 'unreviewed');
    const lists = [() => delayedResponse([STARTER]), () => delayedResponse([copy, STARTER])];
    stubFetch({
      [LIST]: () => lists.shift()!(),
      [`POST /api/admin/exam-practice/${STARTER.id}`]: () => delayedResponse(copy, { status: 201 }),
    });
    render(<ExamPracticeAdmin formats={FORMATS} />);
    await screen.findByText(STARTER.id);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByRole('form', { name: `Edit ${copy.id}` })).toBeInTheDocument();
  });

  it('asks before deleting', async () => {
    const lists = [() => delayedResponse([STARTER]), () => delayedResponse([])];
    stubFetch({
      [LIST]: () => lists.shift()!(),
      [`DELETE /api/admin/exam-practice/${STARTER.id}`]: () => delayedResponse({ ok: true }),
    });
    render(<ExamPracticeAdmin formats={FORMATS} />);
    await screen.findByText(STARTER.id);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(await screen.findByText('No sets for this part yet.')).toBeInTheDocument();
  });
});
