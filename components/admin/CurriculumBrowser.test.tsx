import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonDetail } from './CurriculumBrowser';

describe('LessonDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders Edit and Clone links pointing at the right destinations', async () => {
    (fetch as any).mockResolvedValue({
      json: async () => ({
        lesson: { id: 'a1-l1', track: 'generic', sourceLevel: 'A1', title: 'L1', explanation: null, examples: null },
        exercises: [],
        prerequisites: [],
        conceptLinks: [],
      }),
    });
    render(<LessonDetail lessonId="a1-l1" track="generic" />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());
    expect(screen.getByText('Edit')).toHaveAttribute('href', '/admin/curriculum/lesson/a1-l1/edit?track=generic');
    expect(screen.getByText('Clone')).toHaveAttribute(
      'href',
      '/admin/curriculum/generic/A1/new?cloneFrom=a1-l1'
    );
  });
});
