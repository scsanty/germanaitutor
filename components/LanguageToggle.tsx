'use client';

import type { ContentLanguage } from '@/lib/i18n/localizedText';

// Spec: the en ↔ de switch for content (lesson, feedback, placement questions).
export function LanguageToggle({
  value,
  onChange,
  label,
}: {
  value: ContentLanguage;
  onChange: (language: ContentLanguage) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label}>
      {(['en', 'de'] as const).map((language) => (
        <button key={language} type="button" aria-pressed={value === language} onClick={() => onChange(language)}>
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
