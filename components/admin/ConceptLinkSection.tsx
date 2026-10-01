'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { TRACKS } from '@/lib/tutoring/levels';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { BTN } from './adminStyles';

export interface ConceptLinkEntry {
  id: string;
  title: string;
  track: Track;
}

export function ConceptLinkSection({
  lessonId,
  track,
  sourceLevel,
  links,
  onLinksChange,
}: {
  lessonId: string;
  track: Track;
  sourceLevel: CefrLevel;
  links: ConceptLinkEntry[];
  onLinksChange: (links: ConceptLinkEntry[]) => void;
}) {
  const [candidates, setCandidates] = useState<ConceptLinkEntry[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const otherTracks = TRACKS.filter((t) => t !== track);
    Promise.all(
      otherTracks.map((t) =>
        fetch(`/api/curriculum/tracks/${t}/${sourceLevel}`)
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          })
          .then((structure: { lessons: ConceptLinkEntry[] }[]) =>
            Array.isArray(structure) ? structure.flatMap((entry) => entry.lessons) : []
          )
      )
    )
      .then((lists) => setCandidates(lists.flat()))
      .catch(() => setError('Failed to load link candidates'));
  }, [track, sourceLevel]);

  const linkedIds = new Set(links.map((l) => l.id));
  const unlinkedCandidates = candidates.filter((c) => !linkedIds.has(c.id));

  async function addLink() {
    if (!selectedCandidateId) return;
    setError(null);
    const res = await fetch(`/api/admin/curriculum/lessons/${lessonId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherLessonId: selectedCandidateId }),
    });
    if (res.ok) {
      const added = candidates.find((c) => c.id === selectedCandidateId);
      if (added) onLinksChange([...links, added]);
      setSelectedCandidateId('');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Failed to add link');
    }
  }

  async function removeLink(otherId: string) {
    setError(null);
    const res = await fetch(`/api/admin/curriculum/lessons/${lessonId}/links/${otherId}`, { method: 'DELETE' });
    if (res.ok) {
      onLinksChange(links.filter((l) => l.id !== otherId));
    } else {
      const data = await res.json();
      setError(data.error ?? 'Failed to remove link');
    }
  }

  return (
    <Card className="min-w-0 gap-3">
      <CardHeader>
        <h3 className="text-lg leading-tight font-semibold">Concept Links</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="min-w-0">
                {link.track}: {link.title}
              </span>
              <Button type="button" variant="outline" className={BTN} onClick={() => removeLink(link.id)}>
                Unlink
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <NativeSelect
            wrapperClassName="min-w-0 flex-1 basis-64"
            aria-label="Add link"
            value={selectedCandidateId}
            onChange={(e) => setSelectedCandidateId(e.target.value)}
          >
            <option value="">Select a lesson to link</option>
            {unlinkedCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.track}: {c.title}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" className={BTN} onClick={addLink}>
            Add link
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
