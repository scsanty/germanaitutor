'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { computeBranchLayout } from '@/lib/tutoring/branchLayout';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';

interface DiagramLesson {
  id: string;
  title: string;
  skill: string;
}

interface DiagramEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

interface DiagramEntry {
  milestone: { id: string; title: string; difficultyRank: number | null };
  lessons: DiagramLesson[];
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 80;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 40;

// Admin-only, English. Spec: one band per milestone, each laid out as prerequisite branches.
export function DependencyDiagram({ track, level }: { track: Track; level: CefrLevel }) {
  const [entries, setEntries] = useState<DiagramEntry[] | null>(null);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load dependency diagram');
        return r.json();
      })
      .then((structure: DiagramEntry[]) => {
        const ranked = structure.filter((e) => e.milestone.id !== unsortedMilestoneId(track, level));
        setEntries(ranked);
        return Promise.all(
          ranked.flatMap((e) => e.lessons).map((lesson) =>
            fetch(`/api/curriculum/lessons/${lesson.id}?track=${track}`)
              .then((r) => {
                if (!r.ok) throw new Error('Failed to load dependency diagram');
                return r.json();
              })
              .then((data) => (Array.isArray(data?.prerequisites) ? data.prerequisites : []) as DiagramEdge[])
          )
        );
      })
      .then((lists) => setEdges(lists.flat()))
      .catch(() => setError('Failed to load dependency diagram'));
  }, [track, level]);

  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (!entries) return <p className="text-text-muted">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) => {
        const ids = entry.lessons.map((l) => l.id);
        const inside = edges
          .filter((e) => ids.includes(e.lessonId) && ids.includes(e.prerequisiteLessonId))
          .map((e) => ({ from: e.prerequisiteLessonId, to: e.lessonId }));
        const layout = computeBranchLayout(ids, inside);
        const at = new Map(layout.map((n) => [n.id, n]));
        const byId = new Map(entry.lessons.map((l) => [l.id, l]));
        const columns = Math.max(0, ...layout.map((n) => n.column)) + 1;
        const rows = Math.max(0, ...layout.map((n) => n.row)) + 1;
        return (
          <section key={entry.milestone.id} className="min-w-0 rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-base font-semibold">
              {entry.milestone.difficultyRank}. {entry.milestone.title}
            </h3>
            <div className="overflow-x-auto">
            <svg
              className="max-w-none"
              role="img"
              aria-label={`${entry.milestone.title} dependency diagram`}
              width={columns * COLUMN_WIDTH + 40}
              height={rows * ROW_HEIGHT + 40}
            >
              {inside.map((edge, i) => {
                const from = at.get(edge.from)!;
                const to = at.get(edge.to)!;
                return (
                  <line
                    key={i}
                    x1={from.column * COLUMN_WIDTH + 20 + CARD_WIDTH / 2}
                    y1={from.row * ROW_HEIGHT + 20 + CARD_HEIGHT}
                    x2={to.column * COLUMN_WIDTH + 20 + CARD_WIDTH / 2}
                    y2={to.row * ROW_HEIGHT + 20}
                    className="stroke-text-muted"
                    strokeWidth={1.5}
                  />
                );
              })}
              {layout.map((node) => {
                const lesson = byId.get(node.id)!;
                return (
                  <a
                    key={node.id}
                    className="outline-none focus-visible:[&>g>rect]:stroke-primary focus-visible:[&>g>rect]:stroke-[3]"
                    href={`/admin/curriculum/lesson/${lesson.id}/edit?track=${track}`}>
                    <g transform={`translate(${node.column * COLUMN_WIDTH + 20}, ${node.row * ROW_HEIGHT + 20})`}>
                      <rect width={CARD_WIDTH} height={CARD_HEIGHT} rx={6} className="fill-surface-raised stroke-border" strokeWidth={1.5} />
                      <text x={8} y={16} className="fill-text text-xs font-medium">
                        {lesson.title}
                      </text>
                      <text x={8} y={32} fontSize={10} className="fill-text-muted">
                        {lesson.skill}
                      </text>
                    </g>
                  </a>
                );
              })}
            </svg>
            </div>
          </section>
        );
      })}
    </div>
  );
}
