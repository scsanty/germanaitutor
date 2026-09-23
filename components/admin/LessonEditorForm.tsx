'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import type { Skill } from '@/lib/curriculum/types';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';
import { ExerciseEditor, type ExerciseFormEntry } from './ExerciseEditor';
import { PrerequisitePicker, type PickableLesson } from './PrerequisitePicker';
import { PlacementPicker, type PlacementMilestoneOption, type PlacementValue } from './PlacementPicker';

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

const TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

type TrackStructureResponse = {
  milestone: { id: string; title: string };
  sections: { section: { id: string; title: string }; lessons: { id: string; title: string }[] }[];
}[];

export function LessonEditorForm(
  props:
    | { mode: 'create'; initialTrack: Track; initialSourceLevel: CefrLevel; onSaved: (lesson: { id: string }) => void }
    | { mode: 'edit'; lessonId: string; initial: LessonEditorInitialValues; onSaved: (lesson: { id: string }) => void }
) {
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const lessonId = props.mode === 'edit' ? props.lessonId : undefined;

  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [track, setTrack] = useState<Track>(props.mode === 'create' ? props.initialTrack : initial!.track);
  const [sourceLevel, setSourceLevel] = useState<CefrLevel>(
    props.mode === 'create' ? props.initialSourceLevel : initial!.sourceLevel
  );
  const [skill, setSkill] = useState<Skill>(initial?.skill ?? 'grammar');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [examples, setExamples] = useState<string[]>(initial?.examples ?? []);
  const [exercises, setExercises] = useState<ExerciseFormEntry[]>(initial?.exercises ?? []);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>(initial?.prerequisiteIds ?? []);
  const [placement, setPlacement] = useState<PlacementValue | null>(null);
  const [candidates, setCandidates] = useState<PickableLesson[]>([]);
  const [milestones, setMilestones] = useState<PlacementMilestoneOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${sourceLevel}`)
      .then((r) => r.json())
      .then((structure: TrackStructureResponse) => {
        const unsortedId = unsortedMilestoneId(track, sourceLevel);
        const realEntries = structure.filter((entry) => entry.milestone.id !== unsortedId);
        setMilestones(
          realEntries.map((entry) => ({
            id: entry.milestone.id,
            title: entry.milestone.title,
            sections: entry.sections.map((s) => ({ id: s.section.id, title: s.section.title })),
          }))
        );
        const allLessons = structure.flatMap((entry) => entry.sections.flatMap((s) => s.lessons));
        setCandidates(allLessons.filter((lesson) => lesson.id !== lessonId));
      });
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

      <ExerciseEditor exercises={exercises} onChange={setExercises} />

      <PrerequisitePicker candidates={candidates} selectedIds={prerequisiteIds} onChange={setPrerequisiteIds} />

      <PlacementPicker milestones={milestones} onChange={setPlacement} />

      <button type="submit" disabled={!placement || saving}>
        Save
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
