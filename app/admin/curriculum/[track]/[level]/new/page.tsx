'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { LessonEditorForm, type LessonCloneContent } from '@/components/admin/LessonEditorForm';
import type { Track, CefrLevel } from '@/lib/types';

export default function NewLessonPage() {
  const params = useParams<{ track: string; level: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneFrom = searchParams.get('cloneFrom');
  const [initialContent, setInitialContent] = useState<LessonCloneContent | null>(null);
  const [loading, setLoading] = useState(!!cloneFrom);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloneFrom) return;
    fetch(`/api/curriculum/lessons/${cloneFrom}?track=${params.track}`)
      .then((r) => {
        if (!r.ok) {
          setError('Could not load the lesson to clone');
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const sourceSlug = data.lesson.id.slice(data.lesson.sourceLevel.toLowerCase().length + 1);
        setInitialContent({
          slug: `${sourceSlug}-copy`,
          skill: data.lesson.skill,
          title: data.lesson.title,
          titleDe: data.lesson.titleDe,
          explanation: data.lesson.explanation,
          explanationDe: data.lesson.explanationDe,
          examples: data.lesson.examples,
          examplesDe: data.lesson.examplesDe,
          exercises: data.exercises.map((ex: { type: string; content: unknown }) => ({
            type: ex.type,
            content: ex.content,
          })),
        });
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load the lesson to clone');
        setLoading(false);
      });
  }, [cloneFrom, params.track]);

  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (loading) return <p className="text-text-muted">Loading...</p>;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">New lesson</h1>
    <LessonEditorForm
      mode="create"
      initialTrack={params.track as Track}
      initialSourceLevel={params.level as CefrLevel}
      initialContent={initialContent ?? undefined}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`)}
    />
    </div>
  );
}
