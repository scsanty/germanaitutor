'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LessonEditorForm, type LessonCloneContent } from '@/components/admin/LessonEditorForm';
import type { Track, CefrLevel } from '@/lib/types';

export default function NewLessonPage({ params }: { params: { track: string; level: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneFrom = searchParams.get('cloneFrom');
  const [initialContent, setInitialContent] = useState<LessonCloneContent | null>(null);
  const [loading, setLoading] = useState(!!cloneFrom);

  useEffect(() => {
    if (!cloneFrom) return;
    fetch(`/api/curriculum/lessons/${cloneFrom}?track=${params.track}`)
      .then((r) => r.json())
      .then((data) => {
        const sourceSlug = data.lesson.id.slice(data.lesson.sourceLevel.toLowerCase().length + 1);
        setInitialContent({
          slug: `${sourceSlug}-copy`,
          skill: data.lesson.skill,
          title: data.lesson.title,
          explanation: data.lesson.explanation,
          examples: data.lesson.examples,
          exercises: data.exercises.map((ex: { type: string; content: unknown }) => ({
            type: ex.type,
            content: ex.content,
          })),
        });
        setLoading(false);
      });
  }, [cloneFrom, params.track]);

  if (loading) return <p>Loading...</p>;

  return (
    <LessonEditorForm
      mode="create"
      initialTrack={params.track as Track}
      initialSourceLevel={params.level as CefrLevel}
      initialContent={initialContent ?? undefined}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`)}
    />
  );
}
