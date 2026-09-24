import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { HomeIntro } from './HomeIntro';

describe('HomeIntro', () => {
  it('renders the title, intro and a Settings link in English', () => {
    renderWithIntl(<HomeIntro />);
    expect(screen.getByRole('heading', { name: 'German AI Tutor' })).toBeInTheDocument();
    expect(screen.getByText('Your lessons will appear here soon.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('renders in German', () => {
    renderWithIntl(<HomeIntro />, 'de');
    expect(screen.getByText('Deine Lektionen erscheinen bald hier.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toBeInTheDocument();
  });
});
