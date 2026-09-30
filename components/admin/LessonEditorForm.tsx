'use client';

import { useEffect, useRef, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import type { Skill } from '@/lib/curriculum/types';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';
import { ExerciseEditor, type ExerciseFormEntry } from './ExerciseEditor';
import { PrerequisitePicker, type PickableLesson } from './PrerequisitePicker';
import { PlacementPicker, type PlacementMilestoneOption, type PlacementValue } from './PlacementPicker';
import { LEVELS, TRACKS } from '@/lib/tutoring/levels';

export interface LessonEditorInitialValues {
  slug: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  exercises: ExerciseFormEntry[];
  prerequisiteIds: string[];
}

const SKILLS: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

type TrackStructureResponse = {
  milestone: { id: string; title: string; difficultyRank: number | null };
  lessons: { id: string; title: string }[];
}[];

export type LessonCloneContent = Pick<
  LessonEditorInitialValues,
  'slug' | 'skill' | 'title' | 'explanation' | 'examples' | 'exercises'
>;

export function LessonEditorForm(
  props:
    | {
        mode: 'create';
        initialTrack: Track;
        initialSourceLevel: CefrLevel;
        initialContent?: LessonCloneContent;
        onSaved: (lesson: { id: string }) => void;
      }
    | { mode: 'edit'; lessonId: string; initial: LessonEditorInitialValues; onSaved: (lesson: { id: string }) => void }
) {
  const initial = props.mode === 'edit' ? props.initial : props.initialContent;
  const lessonId = props.mode === 'edit' ? props.lessonId : undefined;

  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [track, setTrack] = useState<Track>(props.mode === 'create' ? props.initialTrack : props.initial.track);
  const [sourceLevel, setSourceLevel] = useState<CefrLevel>(
    props.mode === 'create' ? props.initialSourceLevel : props.initial.sourceLevel
  );
  const [skill, setSkill] = useState<Skill>(initial?.skill ?? 'grammar');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [examples, setExamples] = useState<string[]>(initial?.examples ?? []);
  const [exercises, setExercises] = useState<ExerciseFormEntry[]>(initial?.exercises ?? []);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>(
    props.mode === 'edit' ? props.initial.prerequisiteIds : []
  );
  const [placement, setPlacement] = useState<PlacementValue | null>(null);
  const [candidates, setCandidates] = useState<PickableLesson[]>([]);
  const [milestones, setMilestones] = useState<PlacementMilestoneOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skips the placement/prerequisite reset below on the very first run of this effect (the
  // initial mount), so an edit form's initially-loaded prerequisiteIds aren't immediately
  // wiped out — only an actual track/level *change* after mount should clear them.
  const isFirstRun = useRef(true);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${sourceLevel}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((structure: TrackStructureResponse) => {
        const unsortedId = unsortedMilestoneId(track, sourceLevel);
        const realEntries = structure.filter((entry) => entry.milestone.id !== unsortedId);
        setMilestones(
          realEntries.map((entry) => ({ id: entry.milestone.id, title: entry.milestone.title, difficultyRank: entry.milestone.difficultyRank ?? 0 }))
        );
        const allLessons = structure.flatMap((entry) => entry.lessons);
        setCandidates(allLessons.filter((lesson) => lesson.id !== lessonId));
      })
      .catch(() => setError('Failed to load the track structure'));

    // A track/level change invalidates any placement and prerequisites chosen under the old
    // track+level's structure — force the user to re-pick a placement (Save stays disabled
    // until they do) in the new structure rather than silently filing the lesson under a
    // milestone, or with prerequisites, that belong to the track/level it was just moved out of.
    if (isFirstRun.current) {
      isFirstRun.current = false;
    } else {
      setPlacement(null);
      setPrerequisiteIds([]);
    }
  }, [track, sourceLevel, lessonId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placement) return;
    setSaving(true);
    setError(null);
    const body = {
      ...(props.mode === 'create' ? { slug } : {}),
      track,
      sourceLevel,
      skill,
      title,
      explanation: explanation || null,
      examples: examples.length > 0 ? examples : null,
      exercises,
      prerequisiteIds,
      placement,
    };
    const url = props.mode === 'create' ? '/api/admin/curriculum/lessons' : `/api/admin/curriculum/lessons/${lessonId}`;
    const method = props.mode === 'create' ? 'POST' : 'PATCH';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      props.onSaved(await res.json());
    } else {
      const data = await res.json();
      setError(data.error ?? 'Save failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {props.mode === 'create' && (
        <input placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
      )}
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label>
        Track
        <select aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value as Track)}>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label>
        Level
        <select aria-label="Level" value={sourceLevel} onChange={(e) => setSourceLevel(e.target.value as CefrLevel)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label>
        Skill
        <select aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value as Skill)}>
          {SKILLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <textarea
        placeholder="Explanation"
        value={explanation ?? ''}
        onChange={(e) => setExplanation(e.target.value)}
      />

      <div>
        <h3>Examples</h3>
        {examples.map((example, index) => (
          <div key={index}>
            <input
              aria-label={`Example ${index + 1}`}
              value={example}
              onChange={(e) => setExamples(examples.map((ex, i) => (i === index ? e.target.value : ex)))}
            />
            <button type="button" onClick={() => setExamples(examples.filter((_, i) => i !== index))}>
              Remove example {index + 1}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setExamples([...examples, ''])}>
          Add example
        </button>
      </div>

      <ExerciseEditor exercises={exercises} onChange={setExercises} allowFlashcards={skill === 'vocabulary'} />

      <PrerequisitePicker candidates={candidates} selectedIds={prerequisiteIds} onChange={setPrerequisiteIds} />

      <PlacementPicker key={`${track}-${sourceLevel}`} milestones={milestones} onChange={setPlacement} />

      <button type="submit" disabled={!placement || saving}>
        Save
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
