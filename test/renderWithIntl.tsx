import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PreferencesProvider } from '@/components/providers/PreferencesProvider';
import en from '@/messages/en.json';
import de from '@/messages/de.json';

// A wrapper (not an inline tree) so that `rerender` keeps the providers.
// Sounds are off, so tests stay silent.
export function renderWithIntl(ui: ReactElement, locale: 'en' | 'de' = 'en') {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : de} timeZone="UTC">
        <PreferencesProvider initial={{ theme: 'dark', soundEnabled: false }}>{children}</PreferencesProvider>
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Providers });
}
