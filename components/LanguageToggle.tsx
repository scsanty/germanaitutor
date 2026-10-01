'use client';

import type { ContentLanguage } from '@/lib/i18n/localizedText';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const LANGUAGES = ['en', 'de'] as const;

// Spec: the en ↔ de switch for content (lesson, feedback, placement questions).
// type="multiple" keeps each item a pressable button (aria-pressed); "single" would make them radios.
// Exactly one is ever pressed: clicking the pressed one changes nothing.
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
    <ToggleGroup
      type="multiple"
      role="group"
      rovingFocus={false}
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const picked = next.find((language) => language !== value);
        if (picked) onChange(picked as ContentLanguage);
      }}
      spacing={1}
      className="shrink-0 rounded-full border border-border bg-surface p-0.5"
    >
      {LANGUAGES.map((language) => (
        <ToggleGroupItem
          key={language}
          value={language}
          className="min-h-11 min-w-11 rounded-full px-3 text-xs font-bold tracking-wide text-text-muted transition-colors duration-150 hover:bg-surface-raised hover:text-text motion-reduce:transition-none data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
        >
          {language.toUpperCase()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
