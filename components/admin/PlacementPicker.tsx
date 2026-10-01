'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FIELD_LABEL, INPUT } from './adminStyles';

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
    <Card className="min-w-0 gap-3">
      <CardHeader>
        <h3 className="text-lg leading-tight font-semibold">Placement</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
      <label className={`${FIELD_LABEL} md:max-w-sm`}>
        Milestone
        <NativeSelect
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
        </NativeSelect>
      </label>
      {choice === NEW_OPTION && (
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_8rem]">
          <Input
            className={INPUT}
            aria-label="New milestone title"
            placeholder="New milestone title"
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              emit({ choice, newTitle: e.target.value, newTitleDe, newRank });
            }}
          />
          <Input
            className={INPUT}
            aria-label="New milestone German title"
            placeholder="New milestone German title"
            value={newTitleDe}
            onChange={(e) => {
              setNewTitleDe(e.target.value);
              emit({ choice, newTitle, newTitleDe: e.target.value, newRank });
            }}
          />
          <Input
            className={INPUT}
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
        </div>
      )}
      </CardContent>
    </Card>
  );
}
