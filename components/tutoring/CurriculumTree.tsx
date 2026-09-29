'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CurriculumTree as CurriculumTreeData } from '@/lib/tutoring/progressTypes';

// Spec: Pages and Navigation, `/`. Every lesson stays clickable; unfinished prerequisites are a
// warning only.
export function CurriculumTree({ reloadKey }: { reloadKey: number }) {
  const t = useTranslations('tree');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const [tree, setTree] = useState<CurriculumTreeData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutoring/tree')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as CurriculumTreeData;
        if (!cancelled) {
          setTree(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (failed) return <p role="alert">{t('loadFailed')}</p>;
  if (!tree) return <p>{tCommon('loading')}</p>;

  const empty = tree.milestones.every((m) => m.sections.every((s) => s.lessons.length === 0));
  return (
    <div>
      <h2>{t('heading', { track: tTracks(tree.track), level: tree.level })}</h2>
      {empty && <p>{t('empty')}</p>}
      {tree.milestones.map((milestone) => (
        <section key={milestone.id}>
          <h3>{milestone.title}</h3>
          {milestone.sections.map((section) => (
            <div key={section.id}>
              <h4>{section.title}</h4>
              <ul>
                {section.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link href={`/lesson/${lesson.id}`}>{lesson.title}</Link> —{' '}
                    <span>
                      {lesson.coveredVia
                        ? t('coveredVia', { track: tTracks(lesson.coveredVia) })
                        : t(`status.${lesson.status}`)}
                    </span>
                    {lesson.missingPrerequisites.length > 0 && (
                      <p>{t('buildsOn', { lessons: lesson.missingPrerequisites.map((p) => p.title).join(', ') })}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
