'use client';

import { type CSSProperties, useCallback, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Lock, Play } from 'lucide-react';
import type { TreeLesson, TreeMilestone } from '@/lib/tutoring/progressTypes';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Connector = { key: string; d: string; done: boolean };

const isDone = (lesson: TreeLesson) => lesson.status === 'complete' || lesson.status === 'covered';

// The lessons of one milestone on the grid from branchLayout (column, row), with an SVG layer
// behind them drawing each edge from the prerequisite's node bottom to the dependent's node top.
// Node positions are measured, so rows can grow with long titles. A milestone wider than the
// screen scrolls sideways inside its band (w-0 min-w-full keeps it out of the page's width).
export function MilestoneGrid({ milestone }: { milestone: TreeMilestone }) {
  const gridRef = useRef<HTMLOListElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const columns = Math.max(1, ...milestone.lessons.map((l) => l.column + 1));

  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const origin = grid.getBoundingClientRect();
    const rects = new Map<string, DOMRect>();
    grid.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => rects.set(el.dataset.node!, el.getBoundingClientRect()));
    const node = (id: string) => rects.get(id);
    const byId = new Map(milestone.lessons.map((l) => [l.id, l]));
    const next: Connector[] = [];
    for (const edge of milestone.edges) {
      const a = node(edge.from);
      const b = node(edge.to);
      if (!a || !b || (a.width === 0 && b.width === 0)) continue;
      const x1 = a.left + a.width / 2 - origin.left;
      const y1 = a.bottom - origin.top;
      const x2 = b.left + b.width / 2 - origin.left;
      const y2 = b.top - origin.top;
      const mid = (y1 + y2) / 2;
      next.push({
        key: `${edge.from}-${edge.to}`,
        d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
        done: Boolean(byId.get(edge.from) && isDone(byId.get(edge.from)!)),
      });
    }
    setSize({ width: grid.scrollWidth, height: grid.scrollHeight });
    setConnectors(next);
  }, [milestone]);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined' || !gridRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="w-0 min-w-full overflow-x-auto overscroll-x-contain px-4 pt-1 pb-3 md:px-6">
      <div className="relative w-max min-w-full">
        {size.width > 0 && (
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0"
            width={size.width}
            height={size.height}
            fill="none"
          >
            {connectors.map((c) => (
              <path
                key={c.key}
                d={c.d}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={c.done ? undefined : '2 7'}
                className={c.done ? 'stroke-success/70' : 'stroke-border'}
              />
            ))}
          </svg>
        )}
        <ol
          ref={gridRef}
          className="relative grid list-none justify-center gap-x-2 gap-y-6 p-0 [grid-template-columns:repeat(var(--cols),6rem)] md:gap-x-4 md:[grid-template-columns:repeat(var(--cols),8.5rem)]"
          style={{ '--cols': columns } as CSSProperties}
        >
          {milestone.lessons.map((lesson) => (
            <li
              key={lesson.id}
              className="flex flex-col items-center gap-1 text-center"
              style={{ gridColumn: String(lesson.column + 1), gridRow: String(lesson.row + 1) }}
            >
              <LessonNode lesson={lesson} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function LessonNode({ lesson }: { lesson: TreeLesson }) {
  const t = useTranslations('tree');
  const tTracks = useTranslations('tracks');
  const done = isDone(lesson);
  const circle = cn(
    'flex size-14 items-center justify-center rounded-full md:size-18 [&_svg]:size-6 md:[&_svg]:size-7',
    lesson.locked
      ? 'border-2 border-dashed border-border bg-surface text-text-muted'
      : done
        ? 'bg-success text-background shadow-sm'
        : 'bg-primary text-primary-foreground shadow-md',
    !lesson.locked && lesson.status === 'in_progress' && 'ring-4 ring-primary/30 ring-offset-2 ring-offset-card',
  );
  const Icon = lesson.locked ? Lock : done ? Check : Play;
  // The label sits on the card colour so a connector passing under it tucks behind the text.
  const title = (
    <span className={cn('rounded-md bg-card px-1 text-sm leading-snug font-semibold', lesson.locked && 'text-text-muted')}>
      {lesson.title}
    </span>
  );
  const status = lesson.locked
    ? t('lockedLesson')
    : lesson.coveredVia
      ? t('coveredVia', { track: tTracks(lesson.coveredVia) })
      : t(`status.${lesson.status}`);

  return (
    <>
      {lesson.locked ? (
        <div className="flex flex-col items-center gap-1.5">
          <span data-node={lesson.id} className={circle}>
            <Icon aria-hidden />
          </span>
          {title}
        </div>
      ) : (
        <Link
          href={`/lesson/${lesson.id}`}
          className="group flex flex-col items-center gap-1.5 rounded-xl p-0.5 outline-offset-4"
        >
          <span
            data-node={lesson.id}
            className={cn(circle, 'transition-transform duration-200 group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:scale-100')}
          >
            <Icon aria-hidden className={cn(!done && 'translate-x-0.5')} />
          </span>
          {title}
        </Link>
      )}
      <span className={cn('rounded-md bg-card px-1 text-xs', done ? 'text-success' : 'text-text-muted')}>{status}</span>
      {lesson.earlierPrerequisites.map((p) => (
        <Badge key={p.id} variant="outline" className="mt-0.5 max-w-full bg-card font-normal whitespace-normal text-text-muted">
          {p.done && <Check aria-hidden className="text-success" />}
          <span>{t('buildsOnChip', { title: p.title })}</span>
        </Badge>
      ))}
    </>
  );
}
