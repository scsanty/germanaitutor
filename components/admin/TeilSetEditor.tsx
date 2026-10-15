'use client';

import { useState } from 'react';
import type { ExerciseContent, ExerciseType } from '@/lib/curriculum/types';
import type { LocalizedText } from '@/lib/i18n/localizedText';
import type { TeilSetContent } from '@/lib/exam/teilSets';
import { itemCount, type TaskContent } from '@/lib/tasks/taskTypes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BTN, FIELD_LABEL } from './adminStyles';
import { ExerciseContentFields } from './ExerciseEditor';

// Keeps one explanation pair per item as the item count changes: new items get empty pairs, removed ones drop theirs.
function resized(explanations: LocalizedText[], count: number): LocalizedText[] {
  return Array.from({ length: count }, (_, i) => explanations[i] ?? { en: '', de: '' });
}

// Edits one Teil set: the task content (S6: German-only, so no instruction fields) and an explanation pair per item.
export function TeilSetEditor({
  setId,
  initial,
  saving,
  onSave,
  onCancel,
}: {
  setId: string;
  initial: TeilSetContent;
  saving: boolean;
  onSave: (set: TeilSetContent) => void;
  onCancel: () => void;
}) {
  const [set, setSet] = useState<TeilSetContent>(() => ({
    ...initial,
    explanations: resized(initial.explanations ?? [], itemCount(initial.taskType, initial.content)),
  }));

  function changeContent(content: TaskContent) {
    setSet((s) => ({ ...s, content, explanations: resized(s.explanations, itemCount(s.taskType, content)) }));
  }

  function changeExplanation(index: number, lang: 'en' | 'de', value: string) {
    setSet((s) => ({ ...s, explanations: s.explanations.map((e, i) => (i === index ? { ...e, [lang]: value } : e)) }));
  }

  return (
    <form
      aria-label={`Edit ${setId}`}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(set);
      }}
    >
      <ExerciseContentFields
        // audio_questions fields arrive with the Listening admin editors (T7); until then the type is cast.
        type={set.taskType as ExerciseType}
        content={set.content as ExerciseContent}
        index={0}
        allowInstruction={false}
        onChange={(content) => changeContent(content as TaskContent)}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Explanations</legend>
        {set.explanations.map((e, i) => (
          <div key={i} className="grid gap-3 md:grid-cols-2">
            <label className={FIELD_LABEL}>
              Item {i + 1} explanation (English)
              <Textarea value={e.en} onChange={(ev) => changeExplanation(i, 'en', ev.target.value)} />
            </label>
            <label className={FIELD_LABEL}>
              Item {i + 1} explanation (German)
              <Textarea value={e.de} onChange={(ev) => changeExplanation(i, 'de', ev.target.value)} />
            </label>
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className={BTN} disabled={saving}>
          Save
        </Button>
        <Button type="button" variant="outline" className={BTN} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
