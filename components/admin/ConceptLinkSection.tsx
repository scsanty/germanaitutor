'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { TRACKS } from '@/lib/tutoring/levels';

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
    <div>
      <h3>Concept Links</h3>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            {link.track}: {link.title}
            <button type="button" onClick={() => removeLink(link.id)}>
              Unlink
            </button>
          </li>
        ))}
      </ul>
      <label>
        Add link
        <select
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
        </select>
      </label>
      <button type="button" onClick={addLink}>
        Add link
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
