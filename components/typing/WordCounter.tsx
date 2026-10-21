'use client';

import { useTranslations } from 'next-intl';

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// The running word count; with a target range it turns to the warning colour when outside it.
export function WordCounter({ text, target, id }: { text: string; target?: { min: number; max: number }; id?: string }) {
  const t = useTranslations('typing');
  const count = countWords(text);
  const inRange = !target || (count >= target.min && count <= target.max);
  return (
    <span id={id} data-state={inRange ? 'ok' : 'off'} className={`text-sm tabular-nums ${inRange ? 'text-text-muted' : 'text-warning'}`}>
      {target ? t('count', { count, min: target.min, max: target.max }) : t('words', { count })}
    </span>
  );
}
