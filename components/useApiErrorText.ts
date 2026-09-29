'use client';

import { useTranslations } from 'next-intl';

// Turns an API error body into text in the interface language: `errors.<code>` when the catalog
// knows the code, else the server's English `error`, else the caller's fallback.
export function useApiErrorText(): (data: unknown, fallback: string) => string {
  const t = useTranslations('errors');
  return (data, fallback) => {
    const body = (data && typeof data === 'object' ? data : {}) as {
      error?: unknown;
      code?: unknown;
      params?: unknown;
    };
    if (typeof body.code === 'string' && t.has(body.code)) {
      const params = body.params && typeof body.params === 'object' ? (body.params as Record<string, string>) : {};
      return t(body.code, params);
    }
    return typeof body.error === 'string' ? body.error : fallback;
  };
}
