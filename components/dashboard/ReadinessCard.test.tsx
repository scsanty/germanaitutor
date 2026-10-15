import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ReadinessCard } from './ReadinessCard';

describe('ReadinessCard', () => {
  it('shows each part’s recent average against the 60% mark', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      delayedResponse({
        formatId: 'telc-b1',
        formatName: 'telc Deutsch B1',
        parts: [
          { partId: 'lesen-1', title: { en: 'Reading Part 1', de: 'Leseverstehen Teil 1' }, averagePercent: 72, attempts: 5, overtime: false },
          { partId: 'lesen-2', title: { en: 'Reading Part 2', de: 'Leseverstehen Teil 2' }, averagePercent: 48, attempts: 2, overtime: true },
          { partId: 'lesen-3', title: { en: 'Reading Part 3', de: 'Leseverstehen Teil 3' }, averagePercent: null, attempts: 0, overtime: false },
        ],
      })
    ));
    renderWithIntl(<ReadinessCard />);
    expect(await screen.findByText('telc Deutsch B1 readiness')).toBeInTheDocument();
    expect(screen.getByText('72% · on track')).toBeInTheDocument();
    expect(screen.getByText('48% · below 60% · some overtime')).toBeInTheDocument();
    expect(screen.getByText('Not practised yet')).toBeInTheDocument();
  });

  it('renders nothing when there is no format', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ formatId: null, formatName: null, parts: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithIntl(<ReadinessCard />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });
});
