'use client';

import { useRouter } from 'next/navigation';
import { LessonEditorForm } from '@/components/admin/LessonEditorForm';
import type { Track, CefrLevel } from '@/lib/types';

export default function NewLessonPage({ params }: { params: { track: string; level: string } }) {
  const router = useRouter();
  return (
    <LessonEditorForm
      mode="create"
      initialTrack={params.track as Track}
      initialSourceLevel={params.level as CefrLevel}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`)}
    />
  );
}
