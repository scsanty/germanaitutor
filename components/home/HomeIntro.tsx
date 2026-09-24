'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function HomeIntro() {
  const t = useTranslations('home');
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <nav>
        <Link href="/settings">{t('settings')}</Link>
      </nav>
    </div>
  );
}
