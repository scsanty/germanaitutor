import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { evidenceSpans, TranscriptReveal } from './TranscriptReveal';

const TRANSCRIPT = {
  filter: 'phone' as const,
  lines: [
    { label: 'Anna', gender: 'f' as const, text: 'Hallo, ich komme um acht Uhr.', voice: 'kerstin' },
    { label: 'Ben', gender: 'm' as const, text: 'Gut, dann treffen wir uns am Bahnhof.', voice: 'thorsten' },
  ],
};

describe('TranscriptReveal', () => {
  it('shows each line with its speaker and highlights the evidence', () => {
    const { container } = renderWithIntl(
      <TranscriptReveal transcript={TRANSCRIPT} evidence={['um acht Uhr', null, 'am Bahnhof']} evidenceLines={[0, null, 1]} />
    );
    expect(screen.getByRole('heading', { name: 'Transcript' })).toBeInTheDocument();
    expect(screen.getByText('Anna:')).toBeInTheDocument();
    expect(screen.getByText('Ben:')).toBeInTheDocument();
    const marks = [...container.querySelectorAll('mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['um acht Uhr', 'am Bahnhof']);
    expect(screen.getByText('Evidence for question 3')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^Anna: Hallo, ich komme um acht Uhr/);
    expect(items[0].querySelector('mark')!.nextElementSibling).toHaveTextContent('Evidence for question 1');
  });

  it('highlights only on the line the server names, and merges overlaps', () => {
    expect(evidenceSpans('ab ab', 0, ['ab'], [1])).toEqual([]);
    expect(evidenceSpans('ab ab', 1, ['ab'], [1])).toEqual([{ start: 0, end: 2, questions: [1] }]);
    expect(evidenceSpans('eins zwei drei', 0, ['eins zwei', 'zwei drei'])).toEqual([{ start: 0, end: 14, questions: [1, 2] }]);
  });
});
