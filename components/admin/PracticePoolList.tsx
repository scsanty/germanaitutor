'use client';

import { useEffect, useState } from 'react';
import type {
  ExerciseContent,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '@/lib/curriculum/types';
import type { PracticePoolItem, PracticeReviewStatus } from '@/lib/services/practiceAdminService';
import { LEVELS, TRACKS, TRACK_LABEL } from '@/lib/tutoring/levels';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { BTN, FIELD_LABEL, LINK, TABLE, TABLE_WRAP, TD, TH } from './adminStyles';
import { ExerciseContentFields } from './ExerciseEditor';

function preview(item: PracticePoolItem): string {
  switch (item.type) {
    case 'multiple_choice': {
      const c = item.content as MultipleChoiceContent;
      return `${c.question} (${c.options.join(' | ')})`;
    }
    case 'fill_blank':
      return (item.content as FillBlankContent).textWithBlank;
    case 'flashcard': {
      const c = item.content as FlashcardContent;
      return `${c.front} → ${c.back}`;
    }
    case 'free_text':
      return (item.content as FreeTextContent).prompt;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Admin-only, English. Spec Phase 2: approve, reject, edit, or promote AI-generated exercises.
export function PracticePoolList({
  status,
  lessonId,
  showFilters = false,
}: {
  status?: PracticeReviewStatus;
  lessonId?: string;
  showFilters?: boolean;
}) {
  const [items, setItems] = useState<PracticePoolItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [track, setTrack] = useState('');
  const [level, setLevel] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ id: string; content: ExerciseContent } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (lessonId) query.set('lessonId', lessonId);
    if (track) query.set('track', track);
    if (level) query.set('level', level);
    let cancelled = false;
    fetch(`/api/admin/practice?${query.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PracticePoolItem[];
        if (!cancelled) {
          setItems(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status, lessonId, track, level, reload]);

  async function act(url: string, init: RequestInit) {
    setActionError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
        return;
      }
      setEditing(null);
      setReload((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const patch = (id: string, body: unknown) =>
    act(`/api/admin/practice/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });

  return (
    <div className="flex flex-col gap-4">
      {showFilters && (
        <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            Track
            <NativeSelect aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">All</option>
              {TRACKS.map((t) => (
                <option key={t} value={t}>
                  {TRACK_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={FIELD_LABEL}>
            Level
            <NativeSelect aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      )}
      {loadFailed && (
        <Alert variant="destructive">
          <AlertDescription>Could not load practice exercises</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      {!loadFailed && items === null && <p className="text-text-muted">Loading...</p>}
      {items && items.length === 0 && <p className="rounded-lg border bg-card p-4 text-text-muted">Nothing here.</p>}
      {items && items.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Lesson</th>
                <th scope="col" className={TH}>Track and level</th>
                <th scope="col" className={TH}>Type</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}>Exercise</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className={TD}>
                    <a href={`/admin/curriculum/lesson/${item.lessonId}?track=${item.track}`} className={LINK}>
                      {item.lessonTitle}
                    </a>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {TRACK_LABEL[item.track]} {item.level}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{item.type}</td>
                  <td className={`${TD} whitespace-nowrap`}>{item.reviewStatus}</td>
                  <td className={`${TD} min-w-72`}>
                    {editing?.id === item.id ? (
                      <div className="flex flex-col gap-3">
                        <ExerciseContentFields
                          type={item.type}
                          content={editing.content}
                          index={0}
                          allowInstruction={false}
                          onChange={(content) => setEditing({ id: item.id, content })}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" className={BTN} onClick={() => patch(item.id, { content: editing.content })}>
                            Save
                          </Button>
                          <Button type="button" variant="outline" className={BTN} onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p>{preview(item)}</p>
                        {item.correctAnswer && <p className="text-text-muted">Answer: {item.correctAnswer}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" className={BTN} onClick={() => patch(item.id, { action: 'approve' })}>
                            Approve
                          </Button>
                          <Button type="button" variant="ghost" className={`${BTN} text-destructive hover:text-destructive`} onClick={() => patch(item.id, { action: 'reject' })}>
                            Reject
                          </Button>
                          <Button type="button" variant="outline" className={BTN} onClick={() => setEditing({ id: item.id, content: item.content })}>
                            Edit
                          </Button>
                          <Button type="button" variant="outline" className={BTN} onClick={() => act(`/api/admin/practice/${item.id}/promote`, { method: 'POST' })}>
                            Promote into the lesson
                          </Button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
