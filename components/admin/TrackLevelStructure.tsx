'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';

interface StructureLesson {
  id: string;
  title: string;
}
interface StructureSection {
  section: { id: string; title: string };
  lessons: StructureLesson[];
}
interface StructureEntry {
  milestone: { id: string; title: string };
  sections: StructureSection[];
}

export function TrackLevelStructure({ track, level }: { track: Track; level: CefrLevel }) {
  const [structure, setStructure] = useState<StructureEntry[] | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newSectionTitleFor, setNewSectionTitleFor] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then((r) => r.json())
      .then(setStructure);
  }

  useEffect(load, [track, level]);

  if (!structure) return <p>Loading...</p>;

  const unsortedId = unsortedMilestoneId(track, level);
  const realMilestoneIds = structure.filter((entry) => entry.milestone.id !== unsortedId).map((e) => e.milestone.id);

  async function createMilestone() {
    if (!newMilestoneTitle) return;
    const res = await fetch('/api/admin/curriculum/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, level, title: newMilestoneTitle, description: null }),
    });
    if (res.ok) {
      setNewMilestoneTitle('');
      load();
    } else {
      setError((await res.json()).error ?? 'Failed to create milestone');
    }
  }

  async function renameMilestone(id: string, currentTitle: string) {
    const title = window.prompt('Rename milestone', currentTitle);
    if (!title) return;
    const res = await fetch(`/api/admin/curriculum/milestones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: null }),
    });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to rename milestone');
  }

  async function deleteMilestone(id: string) {
    const entry = structure!.find((e) => e.milestone.id === id)!;
    const lessonTitles = entry.sections.flatMap((s) => s.lessons.map((l) => l.title));
    const message =
      lessonTitles.length > 0
        ? `Delete "${entry.milestone.title}"? ${lessonTitles.length} lesson(s) will move to Unsorted: ${lessonTitles.join(', ')}`
        : `Delete "${entry.milestone.title}"?`;
    if (!window.confirm(message)) return;
    const res = await fetch(`/api/admin/curriculum/milestones/${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to delete milestone');
  }

  async function moveMilestone(id: string, direction: -1 | 1) {
    const ids = [...realMilestoneIds];
    const index = ids.indexOf(id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    const res = await fetch('/api/admin/curriculum/milestones/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, level, orderedIds: ids }),
    });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to reorder milestones');
  }

  async function createSection(milestoneId: string) {
    const title = newSectionTitleFor[milestoneId];
    if (!title) return;
    const res = await fetch('/api/admin/curriculum/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId, title, description: null }),
    });
    if (res.ok) {
      setNewSectionTitleFor((prev) => ({ ...prev, [milestoneId]: '' }));
      load();
    } else {
      setError((await res.json()).error ?? 'Failed to create section');
    }
  }

  async function renameSection(id: string, currentTitle: string) {
    const title = window.prompt('Rename section', currentTitle);
    if (!title) return;
    const res = await fetch(`/api/admin/curriculum/sections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: null }),
    });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to rename section');
  }

  async function deleteSection(milestoneId: string, id: string) {
    const entry = structure!.find((e) => e.milestone.id === milestoneId)!;
    const section = entry.sections.find((s) => s.section.id === id)!;
    const lessonTitles = section.lessons.map((l) => l.title);
    const message =
      lessonTitles.length > 0
        ? `Delete "${section.section.title}"? ${lessonTitles.length} lesson(s) will move to Unsorted: ${lessonTitles.join(', ')}`
        : `Delete "${section.section.title}"?`;
    if (!window.confirm(message)) return;
    const res = await fetch(`/api/admin/curriculum/sections/${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to delete section');
  }

  async function moveSection(milestoneId: string, id: string, direction: -1 | 1) {
    const entry = structure!.find((e) => e.milestone.id === milestoneId)!;
    const ids = entry.sections.map((s) => s.section.id);
    const index = ids.indexOf(id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    const res = await fetch('/api/admin/curriculum/sections/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId, orderedIds: ids }),
    });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to reorder sections');
  }

  return (
    <div>
      <h1>
        {track} — {level}
      </h1>
      <a href={`/admin/curriculum/${track}/${level}/new`}>+ New Lesson</a>

      {structure.map((entry) => {
        const isUnsorted = entry.milestone.id === unsortedId;
        return (
          <div key={entry.milestone.id}>
            <h2>{entry.milestone.title}</h2>
            {!isUnsorted && (
              <>
                <button type="button" onClick={() => moveMilestone(entry.milestone.id, -1)}>
                  Move milestone up
                </button>
                <button type="button" onClick={() => moveMilestone(entry.milestone.id, 1)}>
                  Move milestone down
                </button>
                <button type="button" onClick={() => renameMilestone(entry.milestone.id, entry.milestone.title)}>
                  Rename milestone
                </button>
                <button type="button" onClick={() => deleteMilestone(entry.milestone.id)}>
                  Delete milestone
                </button>
              </>
            )}
            {entry.sections.map(({ section, lessons }) => (
              <div key={section.id}>
                <h3>{section.title}</h3>
                {!isUnsorted && (
                  <>
                    <button type="button" onClick={() => moveSection(entry.milestone.id, section.id, -1)}>
                      Move section up
                    </button>
                    <button type="button" onClick={() => moveSection(entry.milestone.id, section.id, 1)}>
                      Move section down
                    </button>
                    <button type="button" onClick={() => renameSection(section.id, section.title)}>
                      Rename section
                    </button>
                    <button type="button" onClick={() => deleteSection(entry.milestone.id, section.id)}>
                      Delete section
                    </button>
                  </>
                )}
                <ul>
                  {lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <a href={`/admin/curriculum/lesson/${lesson.id}?track=${track}`}>{lesson.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!isUnsorted && (
              <div>
                <input
                  aria-label={`New section title in ${entry.milestone.title}`}
                  value={newSectionTitleFor[entry.milestone.id] ?? ''}
                  onChange={(e) => setNewSectionTitleFor((prev) => ({ ...prev, [entry.milestone.id]: e.target.value }))}
                  placeholder="New section title"
                />
                <button type="button" onClick={() => createSection(entry.milestone.id)}>
                  Add section
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div>
        <input
          aria-label="New milestone title"
          value={newMilestoneTitle}
          onChange={(e) => setNewMilestoneTitle(e.target.value)}
          placeholder="New milestone title"
        />
        <button type="button" onClick={createMilestone}>
          Add milestone
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
