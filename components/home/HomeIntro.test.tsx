import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { HomeIntro } from './HomeIntro';

describe('HomeIntro', () => {
  it('renders the title and links to the Daily review and Settings', () => {
    renderWithIntl(<HomeIntro />);
    expect(screen.getByRole('heading', { name: 'German AI Tutor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Daily review' })).toHaveAttribute('href', '/queue');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('renders in German', () => {
    renderWithIntl(<HomeIntro />, 'de');
    expect(screen.getByRole('link', { name: 'Tägliche Wiederholung' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toBeInTheDocument();
  });
});
