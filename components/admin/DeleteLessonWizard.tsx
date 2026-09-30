'use client';

import { useEffect, useRef, useState } from 'react';
import type { Track } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BTN } from './adminStyles';

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
  repair: { edgesToAdd: RepairEdge[]; edgesToRemove: RepairEdge[]; skippedBridges?: RepairEdge[] };
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
  // True while a preview fetch is in flight. The queue is popped before the fetch resolves, so
  // without this the wizard briefly looks finished (and offers Delete All) between two lessons.
  const [fetching, setFetching] = useState(false);
  // Synchronous in-flight guard for the advance-effect below. `setQueue(rest)` dequeues
  // synchronously in the effect body, but `currentPreview` — the effect's only other
  // re-entry guard — isn't set until the fetch it kicks off actually resolves. A re-render
  // landing between those two moments (real network latency makes this easy to hit) would
  // otherwise let the effect fire again and dequeue a second lesson concurrently, with one
  // preview clobbering the other. A ref update is synchronous, unlike state, so setting this
  // right before the fetch and checking it at the top of the effect closes that window.
  const previewFetchInFlight = useRef(false);

  // Fetch the next queued lesson's own preview once nothing is currently being shown.
  useEffect(() => {
    if (currentPreview !== null || previewError !== null || queue.length === 0) return;
    if (previewFetchInFlight.current) return;
    const [nextId, ...rest] = queue;
    setQueue(rest);
    setCurrentLessonId(nextId);
    previewFetchInFlight.current = true;
    setFetching(true);
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
      })
      .finally(() => {
        previewFetchInFlight.current = false;
        setFetching(false);
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

  const isDone = currentPreview === null && queue.length === 0 && !fetching;

  // An unresolved preview-fetch failure always blocks the wizard here — checked
  // unconditionally, not gated on `!isDone` — so it's never silently swallowed as "no
  // repair effects, no linked lessons", and never falls through to an enabled "Delete All"
  // on the final screen just because the failure happened to be the last (or only) item in
  // the queue.
  if (previewError) {
    return (
      <Card className="gap-3">
        <CardContent className="flex flex-col items-start gap-3">
          <Alert variant="destructive">
            <AlertDescription>{previewError}</AlertDescription>
          </Alert>
          <Button type="button" variant="outline" className={BTN} onClick={onCancel}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isDone) {
    if (!currentPreview) return <p className="text-text-muted">Loading...</p>;
    const edgesToRemove = currentPreview.repair?.edgesToRemove ?? [];
    const edgesToAdd = currentPreview.repair?.edgesToAdd ?? [];
    const skippedBridges = currentPreview.repair?.skippedBridges ?? [];
    // Present offers one at a time, in order — never all of a lesson's linked
    // lessons at once — so each decision is a single unambiguous action.
    const currentOffer = pendingOffers[0];
    return (
      <Card className="gap-3">
        <CardHeader>
          <h2 className="text-lg leading-tight">Deleting {currentLessonId}</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h3 className="mb-1 text-base font-semibold">Repair effects</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
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
              {skippedBridges.map((e, i) => (
                <li key={`skip-${i}`} className="text-warning">
                  Skipped: {e.lessonId} will not require {e.prerequisiteLessonId} (it would break the prerequisite scope)
                </li>
              ))}
            </ul>
          </div>
          {currentOffer && (
            <div>
              <h3 className="mb-2 text-base font-semibold">Also linked to this lesson</h3>
              <div key={currentOffer.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface-raised p-3">
                <span className="min-w-0 flex-1">
                  {currentOffer.track}: {currentOffer.title}
                </span>
                <Button type="button" variant="destructive" className={BTN} onClick={() => decide(currentOffer.id, true)}>
                  Also delete
                </Button>
                <Button type="button" variant="outline" className={BTN} onClick={() => decide(currentOffer.id, false)}>
                  Leave it
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-3">
      <CardHeader>
        <h2 className="text-lg leading-tight">Ready to delete {toDeleteSet.length} lesson(s)</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="list-disc pl-5 text-sm">
          {toDeleteSet.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" className={BTN} onClick={handleDeleteAll} disabled={deleting}>
            Delete All
          </Button>
          <Button type="button" variant="outline" className={BTN} onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
