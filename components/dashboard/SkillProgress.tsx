'use client';

import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import type { Skill } from '@/lib/curriculum/types';

export function SkillProgress({ skills }: { skills: { skill: Skill; done: number; total: number }[] }) {
  const t = useTranslations('dashboard');
  return (
    <ul className="flex flex-col gap-3">
      {skills.map((s) => (
        <li key={s.skill}>
          <div className="flex justify-between text-sm">
            <span>{t(`skill.${s.skill}`)}</span>
            <span className="text-text-muted">{t('ofTotal', { done: s.done, total: s.total })}</span>
          </div>
          <Progress value={s.total === 0 ? 0 : (s.done / s.total) * 100} aria-label={t(`skill.${s.skill}`)} />
        </li>
      ))}
    </ul>
  );
}
