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
import { LEVELS, TRACKS } from '@/lib/tutoring/levels';
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
    <div>
      {showFilters && (
        <p>
          <label>
            Track{' '}
            <select aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">All</option>
              {TRACKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            Level{' '}
            <select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </p>
      )}
      {loadFailed && <p role="alert">Could not load practice exercises</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {!loadFailed && items === null && <p>Loading...</p>}
      {items && items.length === 0 && <p>Nothing here.</p>}
      {items && items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={`/admin/curriculum/lesson/${item.lessonId}?track=${item.track}`}>{item.lessonTitle}</a> · {item.track}{' '}
              {item.level} · {item.type} · {item.reviewStatus}
              {editing?.id === item.id ? (
                <div>
                  <ExerciseContentFields
                    type={item.type}
                    content={editing.content}
                    index={0}
                    allowInstruction={false}
                    onChange={(content) => setEditing({ id: item.id, content })}
                  />
                  <button type="button" onClick={() => patch(item.id, { content: editing.content })}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <p>{preview(item)}</p>
                  {item.correctAnswer && <p>Answer: {item.correctAnswer}</p>}
                  <button type="button" onClick={() => patch(item.id, { action: 'approve' })}>
                    Approve
                  </button>
                  <button type="button" onClick={() => patch(item.id, { action: 'reject' })}>
                    Reject
                  </button>
                  <button type="button" onClick={() => setEditing({ id: item.id, content: item.content })}>
                    Edit
                  </button>
                  <button type="button" onClick={() => act(`/api/admin/practice/${item.id}/promote`, { method: 'POST' })}>
                    Promote into the lesson
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
