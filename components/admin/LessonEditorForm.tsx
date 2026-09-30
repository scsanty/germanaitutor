'use client';

import { useEffect, useRef, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import type { Skill } from '@/lib/curriculum/types';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';
import { ExerciseEditor, type ExerciseFormEntry } from './ExerciseEditor';
import { PrerequisitePicker, type PickableLesson } from './PrerequisitePicker';
import { PlacementPicker, type PlacementMilestoneOption, type PlacementValue } from './PlacementPicker';
import { LEVELS, TRACKS, TRACK_LABEL } from '@/lib/tutoring/levels';
import { Plus, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { BTN, FIELD_LABEL, INPUT } from './adminStyles';

export interface LessonEditorInitialValues {
  slug: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
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
  'slug' | 'skill' | 'title' | 'titleDe' | 'explanation' | 'explanationDe' | 'examples' | 'examplesDe' | 'exercises'
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
  const [titleDe, setTitleDe] = useState(initial?.titleDe ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [explanationDe, setExplanationDe] = useState(initial?.explanationDe ?? '');
  const [examples, setExamples] = useState<{ en: string; de: string }[]>(
    (initial?.examples ?? []).map((en, i) => ({ en, de: initial?.examplesDe?.[i] ?? '' }))
  );
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
      titleDe,
      explanation: explanation || null,
      explanationDe: explanationDe || null,
      examples: examples.length > 0 ? examples.map((r) => r.en) : null,
      examplesDe: examples.length > 0 ? examples.map((r) => r.de) : null,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card className="min-w-0 gap-4">
        <CardHeader>
          <h2 className="text-lg leading-tight">Lesson</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {props.mode === 'create' && (
            <label className={`${FIELD_LABEL} md:max-w-sm`}>
              Slug
              <Input className={INPUT} placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </label>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <label className={FIELD_LABEL}>
              Title (English)
              <Input className={INPUT} aria-label="Title (English)" placeholder="Title (English)" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className={FIELD_LABEL}>
              Title (German)
              <Input className={INPUT} aria-label="Title (German)" placeholder="Title (German)" value={titleDe} onChange={(e) => setTitleDe(e.target.value)} />
            </label>
            <label className={FIELD_LABEL}>
              Explanation (English)
              <Textarea
                className="min-h-28"
                aria-label="Explanation (English)"
                placeholder="Explanation (English)"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </label>
            <label className={FIELD_LABEL}>
              Explanation (German)
              <Textarea
                className="min-h-28"
                aria-label="Explanation (German)"
                placeholder="Explanation (German)"
                value={explanationDe}
                onChange={(e) => setExplanationDe(e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={FIELD_LABEL}>
              Track
              <NativeSelect aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value as Track)}>
                {TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {TRACK_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={FIELD_LABEL}>
              Level
              <NativeSelect aria-label="Level" value={sourceLevel} onChange={(e) => setSourceLevel(e.target.value as CefrLevel)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={FIELD_LABEL}>
              Skill
              <NativeSelect aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value as Skill)}>
                {SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 gap-4">
        <CardHeader>
          <h3 className="text-lg leading-tight font-semibold">Examples</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {examples.map((example, index) => (
            <div key={index} className="grid items-center gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input
                className={INPUT}
                aria-label={`Example ${index + 1} (English)`}
                value={example.en}
                onChange={(e) => setExamples(examples.map((ex, i) => (i === index ? { ...ex, en: e.target.value } : ex)))}
              />
              <Input
                className={INPUT}
                aria-label={`Example ${index + 1} (German)`}
                value={example.de}
                onChange={(e) => setExamples(examples.map((ex, i) => (i === index ? { ...ex, de: e.target.value } : ex)))}
              />
              <Button type="button" variant="ghost" className={`${BTN} justify-self-start text-destructive hover:text-destructive`} onClick={() => setExamples(examples.filter((_, i) => i !== index))}>
                <X aria-hidden />
                Remove example {index + 1}
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={() => setExamples([...examples, { en: '', de: '' }])}>
            <Plus aria-hidden />
            Add example
          </Button>
        </CardContent>
      </Card>

      <ExerciseEditor exercises={exercises} onChange={setExercises} allowFlashcards={skill === 'vocabulary'} />

      <PrerequisitePicker candidates={candidates} selectedIds={prerequisiteIds} onChange={setPrerequisiteIds} />

      <PlacementPicker key={`${track}-${sourceLevel}`} milestones={milestones} onChange={setPlacement} />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" className={BTN} disabled={!placement || saving}>
          Save
        </Button>
        {error && (
          <Alert variant="destructive" className="flex-1">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}
