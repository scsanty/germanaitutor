import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DependencyDiagram } from './DependencyDiagram';

const structure = [
  {
    milestone: { id: 'm1', title: 'M1', description: null, difficultyRank: 1 },
    lessons: [
      { id: 'a1-basics', title: 'Basics', skill: 'grammar' },
      { id: 'a1-advanced', title: 'Advanced', skill: 'grammar' },
    ],
    lessonsBuildingOnUnsorted: [],
  },
  {
    milestone: { id: 'm2', title: 'M2', description: null, difficultyRank: 2 },
    lessons: [{ id: 'a1-later', title: 'Later', skill: 'reading' }],
    lessonsBuildingOnUnsorted: [],
  },
];

describe('DependencyDiagram', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes('/tracks/')) return Promise.resolve({ ok: true, json: async () => structure });
      if (url.includes('/lessons/a1-advanced'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ prerequisites: [{ lessonId: 'a1-advanced', prerequisiteLessonId: 'a1-basics' }] }),
        });
      return Promise.resolve({ ok: true, json: async () => ({ prerequisites: [] }) });
    });
  });

  it('renders a card for every lesson, each linking to its edit form', async () => {
    render(<DependencyDiagram track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Basics')).toBeInTheDocument());
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    const basicsLink = screen.getByText('Basics').closest('a');
    expect(basicsLink).toHaveAttribute('href', '/admin/curriculum/lesson/a1-basics/edit?track=generic');
  });

  it('draws one line per prerequisite edge', async () => {
    const { container } = render(<DependencyDiagram track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Advanced')).toBeInTheDocument());
    expect(container.querySelectorAll('line')).toHaveLength(1);
  });

  it('draws one band per milestone, headed by rank and title', async () => {
    render(<DependencyDiagram track="generic" level="A1" />);
    expect(await screen.findByRole('heading', { name: '1. M1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. M2' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('surfaces an error instead of hanging on Loading when the structure fetch fails', async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes('/tracks/')) return Promise.resolve({ ok: false, json: async () => ({ error: 'Not found' }) });
      return Promise.resolve({ ok: true, json: async () => ({ prerequisites: [] }) });
    });
    render(<DependencyDiagram track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load dependency diagram'));
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
