'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LessonEditorForm, type LessonEditorInitialValues } from '@/components/admin/LessonEditorForm';

export default function EditLessonPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { track?: string };
}) {
  const router = useRouter();
  const track = searchParams.track ?? 'generic';
  const [initial, setInitial] = useState<LessonEditorInitialValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${params.id}?track=${track}`)
      .then((r) => {
        if (!r.ok) {
          setError('Lesson not found');
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const slug = data.lesson.id.slice(data.lesson.sourceLevel.toLowerCase().length + 1);
        setInitial({
          slug,
          track: data.lesson.track,
          sourceLevel: data.lesson.sourceLevel,
          skill: data.lesson.skill,
          title: data.lesson.title,
          explanation: data.lesson.explanation,
          examples: data.lesson.examples,
          exercises: data.exercises.map((ex: { id: string; type: string; content: unknown }) => ({
            id: ex.id,
            type: ex.type,
            content: ex.content,
          })),
          prerequisiteIds: data.prerequisites.map((p: { prerequisiteLessonId: string }) => p.prerequisiteLessonId),
        });
      })
      .catch(() => setError('Lesson not found'));
  }, [params.id, track]);

  if (error) return <p role="alert">{error}</p>;
  if (!initial) return <p>Loading...</p>;

  return (
    <LessonEditorForm
      mode="edit"
      lessonId={params.id}
      initial={initial}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${initial.track}`)}
    />
  );
}
