import { getRequestConfig } from 'next-intl/server';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';

// The interface language is a profile setting, not a URL segment.
export default getRequestConfig(async () => {
  const locale = createProfileService(getDb()).getProfile().uiLanguage;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});
