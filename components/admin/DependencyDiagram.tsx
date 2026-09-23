'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { computeDiagramLayout } from '@/lib/curriculum-admin/diagramLayout';

interface DiagramLesson {
  id: string;
  title: string;
  skill: string;
}

interface DiagramEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 80;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 40;

export function DependencyDiagram({ track, level }: { track: Track; level: CefrLevel }) {
  const [lessons, setLessons] = useState<DiagramLesson[] | null>(null);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then((r) => r.json())
      .then((structure: { sections: { lessons: DiagramLesson[] }[] }[]) => {
        const allLessons = structure.flatMap((entry) => entry.sections.flatMap((s) => s.lessons));
        setLessons(allLessons);
        return Promise.all(
          allLessons.map((lesson) =>
            fetch(`/api/curriculum/lessons/${lesson.id}?track=${track}`)
              .then((r) => r.json())
              .then((data) => (Array.isArray(data?.prerequisites) ? data.prerequisites : []) as DiagramEdge[])
          )
        );
      })
      .then((prereqLists) => setEdges(prereqLists.flat()));
  }, [track, level]);

  if (!lessons) return <p>Loading...</p>;

  const layout = computeDiagramLayout(
    lessons.map((l) => l.id),
    edges
  );
  const positionById = new Map(layout.map((n) => [n.id, n]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const maxColumn = Math.max(0, ...layout.map((n) => n.column));
  const maxRow = Math.max(0, ...layout.map((n) => n.row));

  return (
    <svg
      role="img"
      aria-label={`${track} ${level} dependency diagram`}
      width={(maxColumn + 1) * COLUMN_WIDTH + 40}
      height={(maxRow + 1) * ROW_HEIGHT + 40}
    >
      <defs>
        <marker id="diagram-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="black" />
        </marker>
      </defs>
      {edges.map((edge, i) => {
        const from = positionById.get(edge.prerequisiteLessonId);
        const to = positionById.get(edge.lessonId);
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={from.column * COLUMN_WIDTH + 20 + CARD_WIDTH}
            y1={from.row * ROW_HEIGHT + 20 + CARD_HEIGHT / 2}
            x2={to.column * COLUMN_WIDTH + 20}
            y2={to.row * ROW_HEIGHT + 20 + CARD_HEIGHT / 2}
            stroke="black"
            markerEnd="url(#diagram-arrow)"
          />
        );
      })}
      {layout.map((node) => {
        const lesson = lessonById.get(node.id)!;
        return (
          <a key={node.id} href={`/admin/curriculum/lesson/${lesson.id}/edit?track=${track}`}>
            <g transform={`translate(${node.column * COLUMN_WIDTH + 20}, ${node.row * ROW_HEIGHT + 20})`}>
              <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="white" stroke="black" />
              <text x={8} y={16}>
                {lesson.title}
              </text>
              <text x={8} y={32} fontSize={10}>
                {lesson.skill}
              </text>
            </g>
          </a>
        );
      })}
    </svg>
  );
}
