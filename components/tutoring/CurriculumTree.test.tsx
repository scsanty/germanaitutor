import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { CurriculumTree } from './CurriculumTree';

const lesson = (over: Record<string, unknown>) => ({
  skill: 'grammar',
  status: 'not_started',
  coveredVia: null,
  locked: false,
  earlierPrerequisites: [],
  branch: 0,
  column: 0,
  row: 0,
  ...over,
});

const TREE = {
  track: 'generic',
  level: 'A1',
  milestones: [
    {
      id: 'm1',
      title: 'Basics',
      description: 'Everyday essentials.',
      rank: 1,
      state: 'open',
      edges: [{ from: 'a1-greet', to: 'a1-sein' }],
      testOut: { status: 'none' },
      lessons: [
        lesson({ id: 'a1-greet', title: 'Saying hello', status: 'complete' }),
        lesson({ id: 'a1-sein', title: 'The verb sein', status: 'in_progress', row: 1 }),
        lesson({ id: 'a1-bye', title: 'Saying goodbye', status: 'covered', coveredVia: 'goethe', branch: 1, column: 1 }),
      ],
    },
    {
      id: 'm2',
      title: 'Talking about the past',
      description: null,
      rank: 2,
      state: 'locked',
      edges: [],
      testOut: { status: 'available' },
      lessons: [
        lesson({
          id: 'a2-perfekt',
          title: 'Perfekt',
          locked: true,
          earlierPrerequisites: [{ id: 'a1-sein', title: 'The verb sein', done: false }],
        }),
      ],
    },
  ],
};

function stubTree(response: () => Promise<unknown>) {
  const fetchMock = vi.fn(() => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CurriculumTree', () => {
  it('shows ranked milestones with their state, progress, lessons, and branches', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />);

    expect(await screen.findByRole('heading', { name: 'NaDoch! A1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 · Open · 2 of 3 done')).toBeInTheDocument();
    expect(screen.getByText('Step 2 · Locked · 0 of 1 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/lesson/a1-greet');
    expect(screen.getByText('Covered via Goethe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The verb sein' }).closest('li')).toHaveStyle({ gridRow: '2', gridColumn: '1' });
  });

  it('renders a locked lesson without a link, with its earlier prerequisite as a chip', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText('Perfekt')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Perfekt' })).not.toBeInTheDocument();
    expect(screen.getByText('Builds on: The verb sein')).toBeInTheDocument();
  });

  it('offers the test-out in each of its states', async () => {
    const withStatus = (testOut: unknown) => ({ ...TREE, milestones: [TREE.milestones[0], { ...TREE.milestones[1], testOut }] });
    stubTree(() => delayedResponse(TREE));
    const { unmount } = renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByRole('link', { name: 'Test out' })).toHaveAttribute('href', '/milestone/m2/test-out');
    unmount();

    stubTree(() => delayedResponse(withStatus({ status: 'in_progress', answered: 3, total: 16 })));
    const second = renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByRole('link', { name: 'Resume the test-out (3 of 16)' })).toBeInTheDocument();
    second.unmount();

    stubTree(() => delayedResponse(withStatus({ status: 'cooldown', retryAt: '2026-09-30T10:00:00.000Z' })));
    const third = renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText(/Try the test-out again after/)).toBeInTheDocument();
    third.unmount();

    stubTree(() => delayedResponse(withStatus({ status: 'too_few_questions' })));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText('Not enough questions to test out')).toBeInTheDocument();
  });

  it('says when a level has no lessons yet', async () => {
    stubTree(() => delayedResponse({ track: 'telc', level: 'A1', milestones: [] }));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText('There are no lessons at this level yet.')).toBeInTheDocument();
  });

  it('shows an error when the tree cannot load', async () => {
    stubTree(() => delayedResponse({}, { ok: false, status: 500 }));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your lessons. Please reload the page.');
  });

  it('renders in German', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />, 'de');
    expect(await screen.findByRole('heading', { name: 'NaDoch! A1' })).toBeInTheDocument();
    expect(screen.getByText('Stufe 2 · Gesperrt · 0 von 1 erledigt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Per Test überspringen' })).toBeInTheDocument();
  });
});
