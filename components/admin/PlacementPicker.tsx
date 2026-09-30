'use client';

import { useState } from 'react';

export interface PlacementMilestoneOption {
  id: string;
  title: string;
  difficultyRank: number;
}

export type PlacementValue = { milestoneId: string } | { newMilestoneTitle: string; newMilestoneTitleDe: string; newMilestoneRank: number };

const NEW_OPTION = '__new__';

// Admin-only, English. Spec: choose a milestone, or create one with a title and rank.
export function PlacementPicker({
  milestones,
  onChange,
}: {
  milestones: PlacementMilestoneOption[];
  onChange: (value: PlacementValue | null) => void;
}) {
  const [choice, setChoice] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTitleDe, setNewTitleDe] = useState('');
  const [newRank, setNewRank] = useState('');

  function emit(next: { choice: string; newTitle: string; newTitleDe: string; newRank: string }) {
    if (next.choice === NEW_OPTION) {
      const rank = Number(next.newRank);
      onChange(
        next.newTitle.trim() && next.newTitleDe.trim() && Number.isInteger(rank) && rank >= 1
          ? { newMilestoneTitle: next.newTitle, newMilestoneTitleDe: next.newTitleDe, newMilestoneRank: rank }
          : null
      );
      return;
    }
    onChange(next.choice ? { milestoneId: next.choice } : null);
  }

  return (
    <div>
      <h3>Placement</h3>
      <label>
        Milestone
        <select
          aria-label="Milestone"
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            emit({ choice: e.target.value, newTitle, newTitleDe, newRank });
          }}
        >
          <option value="">Select a milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.difficultyRank}. {m.title}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Create new milestone</option>
        </select>
      </label>
      {choice === NEW_OPTION && (
        <>
          <input
            aria-label="New milestone title"
            placeholder="New milestone title"
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              emit({ choice, newTitle: e.target.value, newTitleDe, newRank });
            }}
          />
          <input
            aria-label="New milestone German title"
            placeholder="New milestone German title"
            value={newTitleDe}
            onChange={(e) => {
              setNewTitleDe(e.target.value);
              emit({ choice, newTitle, newTitleDe: e.target.value, newRank });
            }}
          />
          <input
            aria-label="New milestone rank"
            type="number"
            min={1}
            step={1}
            placeholder="Rank"
            value={newRank}
            onChange={(e) => {
              setNewRank(e.target.value);
              emit({ choice, newTitle, newTitleDe, newRank: e.target.value });
            }}
          />
        </>
      )}
    </div>
  );
}
