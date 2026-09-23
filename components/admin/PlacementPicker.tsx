'use client';

import { useState } from 'react';

export interface PlacementSectionOption {
  id: string;
  title: string;
}

export interface PlacementMilestoneOption {
  id: string;
  title: string;
  sections: PlacementSectionOption[];
}

export type PlacementValue =
  | { sectionId: string }
  | { milestoneId: string; newSectionTitle: string }
  | { newMilestoneTitle: string; newSectionTitle: string };

const NEW_OPTION = '__new__';

export function PlacementPicker({
  milestones,
  onChange,
}: {
  milestones: PlacementMilestoneOption[];
  onChange: (value: PlacementValue | null) => void;
}) {
  const [milestoneChoice, setMilestoneChoice] = useState('');
  const [sectionChoice, setSectionChoice] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const selectedMilestone = milestones.find((m) => m.id === milestoneChoice);

  function emit(next: {
    milestoneChoice: string;
    sectionChoice: string;
    newMilestoneTitle: string;
    newSectionTitle: string;
  }) {
    if (next.milestoneChoice === NEW_OPTION) {
      if (next.newMilestoneTitle && next.newSectionTitle) {
        onChange({ newMilestoneTitle: next.newMilestoneTitle, newSectionTitle: next.newSectionTitle });
      } else {
        onChange(null);
      }
      return;
    }
    if (!next.milestoneChoice) {
      onChange(null);
      return;
    }
    if (next.sectionChoice === NEW_OPTION) {
      onChange(next.newSectionTitle ? { milestoneId: next.milestoneChoice, newSectionTitle: next.newSectionTitle } : null);
      return;
    }
    onChange(next.sectionChoice ? { sectionId: next.sectionChoice } : null);
  }

  function handleMilestoneChange(id: string) {
    setMilestoneChoice(id);
    setSectionChoice('');
    setNewSectionTitle('');
    const keepNewMilestoneTitle = id === NEW_OPTION ? newMilestoneTitle : '';
    setNewMilestoneTitle(keepNewMilestoneTitle);
    emit({ milestoneChoice: id, sectionChoice: '', newMilestoneTitle: keepNewMilestoneTitle, newSectionTitle: '' });
  }

  function handleSectionChange(id: string) {
    setSectionChoice(id);
    emit({ milestoneChoice, sectionChoice: id, newMilestoneTitle, newSectionTitle });
  }

  function handleNewMilestoneTitleChange(title: string) {
    setNewMilestoneTitle(title);
    emit({ milestoneChoice, sectionChoice, newMilestoneTitle: title, newSectionTitle });
  }

  function handleNewSectionTitleChange(title: string) {
    setNewSectionTitle(title);
    emit({ milestoneChoice, sectionChoice, newMilestoneTitle, newSectionTitle: title });
  }

  return (
    <div>
      <h3>Placement</h3>
      <label>
        Milestone
        <select aria-label="Milestone" value={milestoneChoice} onChange={(e) => handleMilestoneChange(e.target.value)}>
          <option value="">Select a milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Create new milestone</option>
        </select>
      </label>

      {milestoneChoice === NEW_OPTION && (
        <input
          aria-label="New milestone title"
          placeholder="New milestone title"
          value={newMilestoneTitle}
          onChange={(e) => handleNewMilestoneTitleChange(e.target.value)}
        />
      )}

      {milestoneChoice && milestoneChoice !== NEW_OPTION && (
        <label>
          Section
          <select aria-label="Section" value={sectionChoice} onChange={(e) => handleSectionChange(e.target.value)}>
            <option value="">Select a section</option>
            {(selectedMilestone?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Create new section</option>
          </select>
        </label>
      )}

      {(sectionChoice === NEW_OPTION || milestoneChoice === NEW_OPTION) && (
        <input
          aria-label="New section title"
          placeholder="New section title"
          value={newSectionTitle}
          onChange={(e) => handleNewSectionTitleChange(e.target.value)}
        />
      )}
    </div>
  );
}
