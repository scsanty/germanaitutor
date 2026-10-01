'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FOCUS, HINT } from './adminStyles';

export interface PickableLesson {
  id: string;
  title: string;
}

export function PrerequisitePicker({
  candidates,
  selectedIds,
  onChange,
}: {
  candidates: PickableLesson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((existing) => existing !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <Card className="min-w-0 gap-3">
      <CardHeader>
        <h3 className="text-lg leading-tight font-semibold">Prerequisites</h3>
      </CardHeader>
      <CardContent className="flex flex-col">
        {candidates.length === 0 && <p className={HINT}>No other lessons in this track/level yet.</p>}
        {candidates.map((lesson) => (
          <label key={lesson.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className={`size-5 shrink-0 rounded-sm accent-primary ${FOCUS}`}
              checked={selectedIds.includes(lesson.id)}
              onChange={() => toggle(lesson.id)}
            />
            {lesson.title}
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
