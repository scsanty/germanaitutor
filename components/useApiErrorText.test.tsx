import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { useApiErrorText } from './useApiErrorText';

function Probe({ data, fallback = 'fallback' }: { data: unknown; fallback?: string }) {
  const errorText = useApiErrorText();
  return <p>{errorText(data, fallback)}</p>;
}

describe('useApiErrorText', () => {
  it('translates a known code with its params', () => {
    renderWithIntl(<Probe data={{ error: 'Level B1 is locked', code: 'level_locked', params: { level: 'B1' } }} />, 'de');
    expect(screen.getByText('Das Niveau B1 ist gesperrt')).toBeInTheDocument();
  });

  it('keeps the provider detail inside the translated sentence', () => {
    renderWithIntl(
      <Probe data={{ error: 'Anthropic returned 429', code: 'ai_failed', params: { detail: 'Anthropic returned 429' } }} />
    );
    expect(screen.getByText('The AI provider reported an error (Anthropic returned 429)')).toBeInTheDocument();
  });

  it('falls back to the English error for an unknown or missing code, then to the fallback', () => {
    renderWithIntl(
      <>
        <Probe data={{ error: 'Something new', code: 'brand_new' }} />
        <Probe data={{ error: 'Old style' }} />
        <Probe data={null} fallback="500" />
      </>
    );
    expect(screen.getByText('Something new')).toBeInTheDocument();
    expect(screen.getByText('Old style')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });
});
