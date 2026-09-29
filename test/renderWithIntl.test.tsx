import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { renderWithIntl } from './renderWithIntl';

function Probe() {
  const t = useTranslations('common');
  return <p>{t('loading')}</p>;
}

describe('renderWithIntl', () => {
  it('renders with the English catalog by default', () => {
    renderWithIntl(<Probe />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with the German catalog when asked', () => {
    renderWithIntl(<Probe />, 'de');
    expect(screen.getByText('Wird geladen …')).toBeInTheDocument();
  });
});
