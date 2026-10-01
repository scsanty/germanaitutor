'use client';

import { useEffect, useState } from 'react';
import type { Lesson, Exercise, LessonPrerequisite } from '@/lib/curriculum/types';
import { ConceptLinkSection, type ConceptLinkEntry } from './ConceptLinkSection';
import { DeleteLessonWizard } from './DeleteLessonWizard';
import { PracticePoolList } from './PracticePoolList';
import { Pencil, Copy, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BTN, PAGE_TITLE } from './adminStyles';

export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [showDeleteWizard, setShowDeleteWizard] = useState(false);
  const [data, setData] = useState<{
    lesson: Lesson;
    exercises: Exercise[];
    prerequisites: LessonPrerequisite[];
    conceptLinks: ConceptLinkEntry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${lessonId}?track=${track}`)
      .then((r) => {
        if (!r.ok) {
          setError('Failed to load lesson');
          return null;
        }
        return r.json();
      })
      .then((result) => {
        if (result) setData(result);
      })
      .catch(() => setError('Failed to load lesson'));
  }, [lessonId, track]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!data) return <p className="text-text-muted">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className={PAGE_TITLE}>{data.lesson.title}</h1>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className={BTN}>
          <a href={`/admin/curriculum/lesson/${lessonId}/edit?track=${track}`}>
            <Pencil aria-hidden />
            Edit
          </a>
        </Button>
        <Button asChild variant="outline" className={BTN}>
          <a href={`/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}/new?cloneFrom=${lessonId}`}>
            <Copy aria-hidden />
            Clone
          </a>
        </Button>
        <Button type="button" variant="ghost" className={`${BTN} text-destructive hover:text-destructive`} onClick={() => setShowDeleteWizard(true)}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>
      {showDeleteWizard && (
        <DeleteLessonWizard
          rootLessonId={lessonId}
          onCancel={() => setShowDeleteWizard(false)}
          onDeleted={() => {
            window.location.href = `/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}`;
          }}
        />
      )}
      <p className="max-w-prose">{data.lesson.explanation}</p>
      <Card className="min-w-0 gap-3">
        <CardHeader>
          <h2 className="text-lg leading-tight">Examples</h2>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5">{(data.lesson.examples ?? []).map((ex, i) => <li key={i}>{ex}</li>)}</ul>
        </CardContent>
      </Card>
      <Card className="min-w-0 gap-3">
        <CardHeader>
          <h2 className="text-lg leading-tight">Exercises ({data.exercises.length})</h2>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {data.exercises.map((ex) => (
              <li key={ex.id} className="rounded-md border bg-surface p-3 text-sm break-words">
                {ex.type}: {JSON.stringify(ex.content)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg leading-tight">Practice pool</h2>
        <PracticePoolList lessonId={lessonId} />
      </section>
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
