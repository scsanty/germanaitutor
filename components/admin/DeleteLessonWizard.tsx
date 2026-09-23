'use client';

import { useEffect, useState } from 'react';
import type { Track } from '@/lib/types';

export interface RepairEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

export interface LinkedLessonOffer {
  id: string;
  title: string;
  track: Track;
}

export interface DeletePreviewResponse {
  lessonId: string;
  repair: { edgesToAdd: RepairEdge[]; edgesToRemove: RepairEdge[] };
  linkedLessons: LinkedLessonOffer[];
}

export function DeleteLessonWizard({
  rootLessonId,
  onCancel,
  onDeleted,
}: {
  rootLessonId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [toDeleteSet, setToDeleteSet] = useState<string[]>([rootLessonId]);
  const [decided, setDecided] = useState<Set<string>>(new Set([rootLessonId]));
  const [queue, setQueue] = useState<string[]>([rootLessonId]);
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
  const [currentPreview, setCurrentPreview] = useState<DeletePreviewResponse | null>(null);
  const [pendingOffers, setPendingOffers] = useState<LinkedLessonOffer[]>([]);
  // Tracks a failed delete-preview GET, kept separate from `error` (below), which is
  // reserved for the final batch-DELETE call's own failure/retry path. The two must never
  // be conflated: `isDone` (computed from `currentPreview`/`queue`) can already be true by
  // the time a preview fetch for the last queued item rejects — `setQueue(rest)` pops the
  // queue synchronously, before the fetch resolves, so if that fetch fails there's no later
  // state update that would make `isDone` false again. Checking `previewError` directly,
  // instead of folding it into `error` and gating on `!isDone`, means the blocking
  // Cancel-only screen renders regardless of queue/currentPreview timing.
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch the next queued lesson's own preview once nothing is currently being shown.
  useEffect(() => {
    if (currentPreview !== null || previewError !== null || queue.length === 0) return;
    const [nextId, ...rest] = queue;
    setQueue(rest);
    setCurrentLessonId(nextId);
    fetch(`/api/admin/curriculum/lessons/${nextId}/delete-preview`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json();
          setPreviewError(data.error ?? 'Failed to load delete preview');
          return;
        }
        const preview: DeletePreviewResponse = await r.json();
        setCurrentPreview(preview);
        setPendingOffers((preview.linkedLessons ?? []).filter((l) => !decided.has(l.id)));
      })
      .catch(() => {
        setPreviewError('Failed to load delete preview');
      });
  }, [queue, currentPreview, decided, previewError]);

  // Once every offer on the current preview is resolved, clear it so the effect above
  // advances to the next queued lesson (or finishes, if the queue is also empty).
  useEffect(() => {
    if (currentPreview && pendingOffers.length === 0) {
      setCurrentPreview(null);
    }
  }, [pendingOffers, currentPreview]);

  function decide(linkedId: string, accept: boolean) {
    setDecided((prev) => new Set(prev).add(linkedId));
    if (accept) {
      setToDeleteSet((prev) => [...prev, linkedId]);
      setQueue((prev) => [...prev, linkedId]);
    }
    setPendingOffers((prev) => prev.filter((l) => l.id !== linkedId));
  }

  async function handleDeleteAll() {
    setDeleting(true);
    setError(null);
    const res = await fetch('/api/admin/curriculum/lessons', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonIds: toDeleteSet }),
    });
    setDeleting(false);
    if (res.ok) {
      onDeleted();
    } else {
      const data = await res.json();
      setError(data.error ?? 'Delete failed');
    }
  }

  const isDone = currentPreview === null && queue.length === 0;

  // An unresolved preview-fetch failure always blocks the wizard here — checked
  // unconditionally, not gated on `!isDone` — so it's never silently swallowed as "no
  // repair effects, no linked lessons", and never falls through to an enabled "Delete All"
  // on the final screen just because the failure happened to be the last (or only) item in
  // the queue.
  if (previewError) {
    return (
      <div>
        <p role="alert">{previewError}</p>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (!isDone) {
    if (!currentPreview) return <p>Loading...</p>;
    const edgesToRemove = currentPreview.repair?.edgesToRemove ?? [];
    const edgesToAdd = currentPreview.repair?.edgesToAdd ?? [];
    // Present offers one at a time, in order — never all of a lesson's linked
    // lessons at once — so each decision is a single unambiguous action.
    const currentOffer = pendingOffers[0];
    return (
      <div>
        <h2>Deleting {currentLessonId}</h2>
        <h3>Repair effects</h3>
        <ul>
          {edgesToRemove.map((e, i) => (
            <li key={`remove-${i}`}>
              Remove: {e.lessonId} no longer requires {e.prerequisiteLessonId}
            </li>
          ))}
          {edgesToAdd.map((e, i) => (
            <li key={`add-${i}`}>
              Add: {e.lessonId} now requires {e.prerequisiteLessonId}
            </li>
          ))}
        </ul>
        {currentOffer && (
          <div>
            <h3>Also linked to this lesson</h3>
            <div key={currentOffer.id}>
              <span>
                {currentOffer.track}: {currentOffer.title}
              </span>
              <button type="button" onClick={() => decide(currentOffer.id, true)}>
                Also delete
              </button>
              <button type="button" onClick={() => decide(currentOffer.id, false)}>
                Leave it
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2>Ready to delete {toDeleteSet.length} lesson(s)</h2>
      <ul>
        {toDeleteSet.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      <button type="button" onClick={handleDeleteAll} disabled={deleting}>
        Delete All
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
