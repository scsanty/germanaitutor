'use client';

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
    <div>
      <h3>Prerequisites</h3>
      {candidates.length === 0 && <p>No other lessons in this track/level yet.</p>}
      {candidates.map((lesson) => (
        <label key={lesson.id}>
          <input type="checkbox" checked={selectedIds.includes(lesson.id)} onChange={() => toggle(lesson.id)} />
          {lesson.title}
        </label>
      ))}
    </div>
  );
}
