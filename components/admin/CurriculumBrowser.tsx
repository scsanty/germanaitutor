'use client';

import { useEffect, useState } from 'react';
import type { Lesson, Exercise, LessonPrerequisite } from '@/lib/curriculum/types';
import { ConceptLinkSection, type ConceptLinkEntry } from './ConceptLinkSection';

export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [data, setData] = useState<{
    lesson: Lesson;
    exercises: Exercise[];
    prerequisites: LessonPrerequisite[];
    conceptLinks: ConceptLinkEntry[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${lessonId}?track=${track}`)
      .then((r) => r.json())
      .then(setData);
  }, [lessonId, track]);

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h1>{data.lesson.title}</h1>
      <a href={`/admin/curriculum/lesson/${lessonId}/edit?track=${track}`}>Edit</a>
      <a href={`/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}/new?cloneFrom=${lessonId}`}>Clone</a>
      <p>{data.lesson.explanation}</p>
      <h2>Examples</h2>
      <ul>{(data.lesson.examples ?? []).map((ex, i) => <li key={i}>{ex}</li>)}</ul>
      <h2>Exercises ({data.exercises.length})</h2>
      <ul>
        {data.exercises.map((ex) => (
          <li key={ex.id}>
            {ex.type}: {JSON.stringify(ex.content)}
          </li>
        ))}
      </ul>
      <ConceptLinkSection
        lessonId={lessonId}
        track={data.lesson.track}
        sourceLevel={data.lesson.sourceLevel}
        links={data.conceptLinks}
        onLinksChange={(conceptLinks) => setData({ ...data, conceptLinks })}
      />
    </div>
  );
}
