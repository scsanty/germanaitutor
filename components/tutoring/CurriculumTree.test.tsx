import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { CurriculumTree } from './CurriculumTree';

const TREE = {
  track: 'generic',
  level: 'A1',
  milestones: [
    {
      id: 'm1',
      title: 'Basics',
      sections: [
        {
          id: 's1',
          title: 'Greetings',
          lessons: [
            { id: 'a1-greet', title: 'Saying hello', skill: 'vocabulary', status: 'complete', coveredVia: null, missingPrerequisites: [] },
            {
              id: 'a1-sein',
              title: 'The verb sein',
              skill: 'grammar',
              status: 'in_progress',
              coveredVia: null,
              missingPrerequisites: [{ id: 'a1-pronouns', title: 'Pronouns' }],
            },
            { id: 'a1-bye', title: 'Saying goodbye', skill: 'vocabulary', status: 'covered', coveredVia: 'goethe', missingPrerequisites: [] },
          ],
        },
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
  it('shows milestones, sections, and each lesson with its status and warnings', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />);

    expect(await screen.findByRole('heading', { name: 'Generic A1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Greetings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/lesson/a1-greet');
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Builds on: Pronouns')).toBeInTheDocument();
    expect(screen.getByText('Covered via Goethe')).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Allgemein A1' })).toBeInTheDocument();
    expect(screen.getByText('Abgedeckt über Goethe')).toBeInTheDocument();
  });
});
