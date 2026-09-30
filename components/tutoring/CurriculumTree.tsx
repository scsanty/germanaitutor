'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { CurriculumTree as CurriculumTreeData, TreeMilestone } from '@/lib/tutoring/progressTypes';

// Spec: Student UI. Milestones in rank order; inside each, lessons sit on a grid by their
// branch layout (the design pass draws the connecting lines). Locked lessons aren't links.
export function CurriculumTree({ reloadKey }: { reloadKey: number }) {
  const t = useTranslations('tree');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const format = useFormatter();
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

  function testOut(milestone: TreeMilestone) {
    const s = milestone.testOut;
    const href = `/milestone/${milestone.id}/test-out`;
    switch (s.status) {
      case 'available':
        return <Link href={href}>{t('testOutStart')}</Link>;
      case 'in_progress':
        return <Link href={href}>{t('testOutResume', { answered: s.answered, total: s.total })}</Link>;
      case 'cooldown':
        return <p>{t('testOutCooldown', { time: format.dateTime(new Date(s.retryAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>;
      case 'too_few_questions':
        return <p>{t('testOutTooFew')}</p>;
      case 'none':
        return null;
    }
  }

  const empty = tree.milestones.every((m) => m.lessons.length === 0);
  return (
    <div>
      <h2>{t('heading', { track: tTracks(tree.track), level: tree.level })}</h2>
      {empty && <p>{t('empty')}</p>}
      {tree.milestones.map((milestone) => {
        const done = milestone.lessons.filter((l) => l.status === 'complete' || l.status === 'covered').length;
        return (
          <section key={milestone.id}>
            <h3>{milestone.title}</h3>
            <p>
              {t('milestoneLine', {
                rank: milestone.rank,
                state: t(`milestoneState.${milestone.state}`),
                done,
                total: milestone.lessons.length,
              })}
            </p>
            {milestone.description && <p>{milestone.description}</p>}
            {testOut(milestone)}
            <ol style={{ display: 'grid', listStyle: 'none', padding: 0 }}>
              {milestone.lessons.map((lesson) => (
                <li key={lesson.id} style={{ gridColumn: String(lesson.column + 1), gridRow: String(lesson.row + 1) }}>
                  {lesson.locked ? (
                    <span>{lesson.title}</span>
                  ) : (
                    <Link href={`/lesson/${lesson.id}`}>{lesson.title}</Link>
                  )}{' '}
                  —{' '}
                  <span>
                    {lesson.locked
                      ? t('lockedLesson')
                      : lesson.coveredVia
                        ? t('coveredVia', { track: tTracks(lesson.coveredVia) })
                        : t(`status.${lesson.status}`)}
                  </span>
                  {lesson.earlierPrerequisites.map((p) => (
                    <p key={p.id}>{t('buildsOnChip', { title: p.title })}</p>
                  ))}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
