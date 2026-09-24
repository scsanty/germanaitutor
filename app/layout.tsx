import type { ReactNode } from 'react';
import { join } from 'node:path';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import { getDb } from '@/lib/db/client';
import { loadSeedIfNeeded } from '@/lib/services/curriculumSeedLoader';

loadSeedIfNeeded(getDb(), join(process.cwd(), 'data', 'curriculum-seed'));

// The locale is read from the database, so no page may be prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
