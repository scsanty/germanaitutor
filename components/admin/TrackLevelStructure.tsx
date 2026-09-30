'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { TRACK_LABEL } from '@/lib/tutoring/levels';
import { Plus, Trash2, Pencil, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { DependencyDiagram } from './DependencyDiagram';
import { BTN, INPUT, LINK, PAGE_TITLE } from './adminStyles';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';

export interface StructureLesson {
  id: string;
  title: string;
}
export interface StructureEntry {
  milestone: { id: string; title: string; titleDe: string; description: string | null; descriptionDe: string | null; difficultyRank: number | null };
  lessons: StructureLesson[];
  lessonsBuildingOnUnsorted: string[];
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : fallback;
}

// Admin-only, English. Spec: milestones listed by difficulty rank; lessons have no order inside one.
export function TrackLevelStructure({ track, level }: { track: Track; level: CefrLevel }) {
  const [structure, setStructure] = useState<StructureEntry[] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newTitleDe, setNewTitleDe] = useState('');
  const [newRank, setNewRank] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'tree' | 'diagram'>('tree');
  const [pendingDelete, setPendingDelete] = useState<StructureEntry | null>(null);

  function load() {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setStructure((await r.json()) as StructureEntry[]);
      })
      .catch(() => setError('Failed to load structure'));
  }

  useEffect(load, [track, level]);

  if (error && !structure) return <p role="alert">{error}</p>;
  if (!structure) return <p>Loading...</p>;

  const unsortedId = unsortedMilestoneId(track, level);

  async function createMilestone() {
    const res = await fetch('/api/admin/curriculum/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, level, title: newTitle, titleDe: newTitleDe, description: null, descriptionDe: null, difficultyRank: Number(newRank) }),
    });
    if (res.ok) {
      setNewTitle('');
      setNewTitleDe('');
      setNewRank('');
      setError(null);
      load();
    } else setError(await errorOf(res, 'Failed to create milestone'));
  }

  async function saveMilestone(entry: StructureEntry, changes: Partial<{ title: string; titleDe: string; description: string | null; descriptionDe: string | null; difficultyRank: number }>) {
    const body = {
      title: entry.milestone.title,
      titleDe: entry.milestone.titleDe,
      description: entry.milestone.description,
      descriptionDe: entry.milestone.descriptionDe,
      difficultyRank: entry.milestone.difficultyRank,
      ...changes,
    };
    const res = await fetch(`/api/admin/curriculum/milestones/${entry.milestone.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setError(null);
      load();
    } else setError(await errorOf(res, 'Failed to save milestone'));
  }

  function deleteMessage(entry: StructureEntry): string {
    const titles = entry.lessons.map((l) => l.title);
    return titles.length > 0
      ? `${titles.length} lesson(s) will move to Unsorted: ${titles.join(', ')}`
      : 'It has no lessons.';
  }

  async function deleteMilestone(entry: StructureEntry) {
    setPendingDelete(null);
    const res = await fetch(`/api/admin/curriculum/milestones/${entry.milestone.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError(await errorOf(res, 'Failed to delete milestone'));
  }

  async function moveLesson(lessonId: string, milestoneId: string) {
    const res = await fetch(`/api/admin/curriculum/lessons/${lessonId}/milestone`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId }),
    });
    if (res.ok) {
      setError(null);
      load();
    } else setError(await errorOf(res, 'Failed to move lesson'));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className={PAGE_TITLE}>
        {TRACK_LABEL[track]} — {level}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className={BTN}>
          <a href={`/admin/curriculum/${track}/${level}/new`}>
            <Plus aria-hidden /> New Lesson
          </a>
        </Button>
        <div className="flex gap-1" role="group" aria-label="View">
          <Button type="button" className={BTN} variant={tab === 'tree' ? 'secondary' : 'ghost'} aria-pressed={tab === 'tree'} onClick={() => setTab('tree')}>
            Tree
          </Button>
          <Button type="button" className={BTN} variant={tab === 'diagram' ? 'secondary' : 'ghost'} aria-pressed={tab === 'diagram'} onClick={() => setTab('diagram')}>
            Diagram
          </Button>
        </div>
      </div>

      {tab === 'diagram' && <DependencyDiagram track={track} level={level} />}

      {tab === 'tree' &&
        structure.map((entry) => {
          const isUnsorted = entry.milestone.id === unsortedId;
          return (
            <Card key={entry.milestone.id} className="min-w-0 gap-3">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2 className="min-w-0 flex-1 text-lg leading-tight">
                    {isUnsorted ? '' : `${entry.milestone.difficultyRank}. `}
                    {entry.milestone.title}
                  </h2>
                  {!isUnsorted && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        Rank
                        <Input
                          aria-label={`Rank of ${entry.milestone.title}`}
                          className={`${INPUT} w-20`}
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={entry.milestone.difficultyRank ?? 1}
                          onBlur={(e) => {
                            const rank = Number(e.target.value);
                            if (rank !== entry.milestone.difficultyRank) saveMilestone(entry, { difficultyRank: rank });
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        className={BTN}
                        onClick={() => {
                          const title = window.prompt('Rename milestone (English)', entry.milestone.title);
                          if (!title) return;
                          const titleDe = window.prompt('Rename milestone (German)', entry.milestone.titleDe);
                          if (titleDe) saveMilestone(entry, { title, titleDe });
                        }}
                      >
                        <Pencil aria-hidden /> Rename milestone
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className={`${BTN} text-destructive hover:text-destructive`}
                        onClick={() => setPendingDelete(entry)}
                      >
                        <Trash2 aria-hidden /> Delete milestone
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {entry.lessons.length === 0 && <p className="text-sm text-text-muted">No lessons yet.</p>}
                <ul className="flex flex-col divide-y">
                  {entry.lessons.map((lesson) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
                        <a href={`/admin/curriculum/lesson/${lesson.id}?track=${track}`} className={LINK}>
                          {lesson.title}
                        </a>
                        {entry.lessonsBuildingOnUnsorted.includes(lesson.id) && (
                          <em className="inline-flex items-center gap-1 text-sm text-warning not-italic">
                            <TriangleAlert aria-hidden className="size-4" />
                            <span className="italic">builds on a lesson in Unsorted</span>
                          </em>
                        )}
                      </div>
                      <NativeSelect
                        wrapperClassName="w-full sm:w-56"
                        aria-label={`Move ${lesson.title} to`}
                        value=""
                        onChange={(e) => e.target.value && moveLesson(lesson.id, e.target.value)}
                      >
                        <option value="">Move to…</option>
                        {structure
                          .filter((other) => other.milestone.id !== entry.milestone.id)
                          .map((other) => (
                            <option key={other.milestone.id} value={other.milestone.id}>
                              {other.milestone.difficultyRank === null ? '' : `${other.milestone.difficultyRank}. `}
                              {other.milestone.title}
                            </option>
                          ))}
                      </NativeSelect>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}

      <Card className="min-w-0 gap-3">
        <CardHeader>
          <h2 className="text-lg leading-tight">Add a milestone</h2>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
          <Input className={INPUT} aria-label="New milestone title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New milestone title" />
          <Input
            className={INPUT}
            aria-label="New milestone German title"
            value={newTitleDe}
            onChange={(e) => setNewTitleDe(e.target.value)}
            placeholder="New milestone German title"
          />
          <Input
            className={INPUT}
            aria-label="New milestone rank"
            type="number"
            min={1}
            step={1}
            value={newRank}
            onChange={(e) => setNewRank(e.target.value)}
            placeholder="Rank"
          />
          <Button type="button" className={BTN} onClick={createMilestone}>
            Add milestone
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{pendingDelete?.milestone.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>{pendingDelete ? deleteMessage(pendingDelete) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11!">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="h-11!" onClick={() => pendingDelete && deleteMilestone(pendingDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
