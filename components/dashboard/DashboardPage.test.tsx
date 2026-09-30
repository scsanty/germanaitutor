import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { DashboardPage } from './DashboardPage';

const days = Array.from({ length: 84 }, (_, i) => ({ date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, count: i === 83 ? 5 : 0 }));
const VIEW = {
  continueLesson: { id: 'a1-sein', title: 'The verb sein' },
  reviewsDue: 3,
  skills: [
    { skill: 'grammar', done: 2, total: 5 },
    { skill: 'reading', done: 0, total: 3 },
  ],
  activity: days,
};

describe('DashboardPage', () => {
  it('shows continue, reviews, progress by skill, and the activity heatmap', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse(VIEW)));
    renderWithIntl(<DashboardPage />);
    expect(await screen.findByRole('link', { name: 'Continue: The verb sein' })).toHaveAttribute('href', '/lesson/a1-sein');
    expect(screen.getByRole('link', { name: 'Start today’s 3 reviews' })).toHaveAttribute('href', '/queue');
    expect(screen.getByText('Grammar')).toBeInTheDocument();
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(84);
    expect(screen.getByRole('gridcell', { name: /5 answers/ })).toBeInTheDocument();
  });

  it('says when nothing is due and when there is nothing to continue', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ ...VIEW, continueLesson: null, reviewsDue: 0 })));
    renderWithIntl(<DashboardPage />);
    expect(await screen.findByText('No reviews due today.')).toBeInTheDocument();
    expect(screen.getByText('Pick a lesson from your tree to get started.')).toBeInTheDocument();
  });

  it('shows an error when the dashboard cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({}, { ok: false, status: 500 })));
    renderWithIntl(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your dashboard. Please reload the page.');
  });
});
