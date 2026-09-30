'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { DependencyDiagram } from './DependencyDiagram';
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

  async function deleteMilestone(entry: StructureEntry) {
    const titles = entry.lessons.map((l) => l.title);
    const message =
      titles.length > 0
        ? `Delete "${entry.milestone.title}"? ${titles.length} lesson(s) will move to Unsorted: ${titles.join(', ')}`
        : `Delete "${entry.milestone.title}"?`;
    if (!window.confirm(message)) return;
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
    <div>
      <h1>
        {track} — {level}
      </h1>
      <a href={`/admin/curriculum/${track}/${level}/new`}>+ New Lesson</a>
      <button type="button" onClick={() => setTab('tree')}>
        Tree
      </button>
      <button type="button" onClick={() => setTab('diagram')}>
        Diagram
      </button>

      {tab === 'diagram' && <DependencyDiagram track={track} level={level} />}

      {tab === 'tree' &&
        structure.map((entry) => {
          const isUnsorted = entry.milestone.id === unsortedId;
          return (
            <div key={entry.milestone.id}>
              <h2>
                {isUnsorted ? '' : `${entry.milestone.difficultyRank}. `}
                {entry.milestone.title}
              </h2>
              {!isUnsorted && (
                <>
                  <label>
                    Rank{' '}
                    <input
                      aria-label={`Rank of ${entry.milestone.title}`}
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
                  <button
                    type="button"
                    onClick={() => {
                      const title = window.prompt('Rename milestone (English)', entry.milestone.title);
                      if (!title) return;
                      const titleDe = window.prompt('Rename milestone (German)', entry.milestone.titleDe);
                      if (titleDe) saveMilestone(entry, { title, titleDe });
                    }}
                  >
                    Rename milestone
                  </button>
                  <button type="button" onClick={() => deleteMilestone(entry)}>
                    Delete milestone
                  </button>
                </>
              )}
              <ul>
                {entry.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a href={`/admin/curriculum/lesson/${lesson.id}?track=${track}`}>{lesson.title}</a>{' '}
                    {entry.lessonsBuildingOnUnsorted.includes(lesson.id) && <em>builds on a lesson in Unsorted</em>}{' '}
                    <select
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
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

      <div>
        <input aria-label="New milestone title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New milestone title" />
        <input
          aria-label="New milestone German title"
          value={newTitleDe}
          onChange={(e) => setNewTitleDe(e.target.value)}
          placeholder="New milestone German title"
        />
        <input
          aria-label="New milestone rank"
          type="number"
          min={1}
          step={1}
          value={newRank}
          onChange={(e) => setNewRank(e.target.value)}
          placeholder="Rank"
        />
        <button type="button" onClick={createMilestone}>
          Add milestone
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
