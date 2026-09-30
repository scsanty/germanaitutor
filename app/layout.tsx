import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, Nunito } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { PreferencesProvider } from '@/components/providers/PreferencesProvider';
import { ensureBundledSeeds } from '@/lib/services/bundledSeeds';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = { title: 'NaDoch!', appleWebApp: { capable: true, title: 'NaDoch!' } };
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

// The locale is read from the database, so no page may be prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  ensureBundledSeeds(getDb);
  const profile = createProfileService(getDb()).getProfile();
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();
  return (
    <html lang={locale} data-theme={profile.theme} className={`${inter.variable} ${nunito.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <PreferencesProvider initial={{ theme: profile.theme, soundEnabled: profile.soundEnabled }}>{children}</PreferencesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
