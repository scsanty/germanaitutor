import { describe, it, expect, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { TopMistakesCard } from './TopMistakesCard';

// Waits for the (delayed) response itself, then lets React apply what the card did with it.
async function settled(fetchMock: { mock: { results: { value: unknown }[] } }) {
  await vi.waitFor(() => expect(fetchMock.mock.results.length).toBeGreaterThan(0));
  await act(async () => {
    const res = (await fetchMock.mock.results[0].value) as { json: () => Promise<unknown> };
    await res.json();
  });
}

const ITEMS = [
  {
    categoryId: 'case',
    label: { en: 'Case', de: 'Kasus' },
    count: 4,
    example: { wrong: 'dem Tisch', right: 'den Tisch' },
    lesson: { id: 'g-akk', title: 'The accusative' },
    drillTopic: null,
  },
  {
    categoryId: 'word_order',
    label: { en: 'Word order', de: 'Wortstellung' },
    count: 2,
    example: { wrong: 'ich habe gestern gegangen', right: 'ich bin gestern gegangen' },
    lesson: null,
    drillTopic: 'Word order in main clauses',
  },
];

describe('TopMistakesCard', () => {
  it('lists each mistake with its count, example and a lesson or Freestyle link', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ items: ITEMS })));
    renderWithIntl(<TopMistakesCard />);
    expect(await screen.findByText('Your top mistakes')).toBeInTheDocument();
    expect(screen.getByText('Case')).toBeInTheDocument();
    expect(screen.getByText('4×')).toBeInTheDocument();
    expect(screen.getByText('dem Tisch')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The accusative' })).toHaveAttribute('href', '/lesson/g-akk');
    expect(screen.getByRole('link', { name: 'Practise in Freestyle' })).toHaveAttribute(
      'href',
      '/freestyle/grammar_drill?topic=Word%20order%20in%20main%20clauses'
    );
  });

  it('renders nothing when there are no mistakes in the last 30 days', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithIntl(<TopMistakesCard />);
    await settled(fetchMock);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(screen.queryByText('Your top mistakes')).toBeNull();
  });

  it('renders nothing when the load fails', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ items: ITEMS }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithIntl(<TopMistakesCard />);
    await settled(fetchMock);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });
});
