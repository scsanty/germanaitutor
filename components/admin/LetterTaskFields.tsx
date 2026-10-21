'use client';

import type { LetterContent } from '@/lib/curriculum/types';
import type { LetterRegister, LetterTask } from '@/lib/tasks/letter';
import { validateLetter } from '@/lib/tasks/letter';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { BTN, FIELD_LABEL, HINT, INPUT } from './adminStyles';

const REGISTERS: { value: LetterRegister; label: string }[] = [
  { value: 'informal', label: 'Informal (du)' },
  { value: 'semi_formal', label: 'Semi-formal' },
  { value: 'formal', label: 'Formal (Sie)' },
];

export const blankLetterTask = (): LetterTask => ({
  situation: '',
  leitpunkte: ['', '', ''],
  register: 'informal',
  wordTarget: { min: 30, max: 50 },
});

// A lesson letter (S19): one task, or Task A and B to choose from. The situation and the Leitpunkte
// are German; the instruction pair is edited below, with the other exercise types. Admin text is English.
export function LetterTaskFields({
  content,
  index,
  onChange,
}: {
  content: LetterContent;
  index: number;
  onChange: (content: LetterContent) => void;
}) {
  const n = index + 1;
  // The same checks the save runs; shown once a situation is being written.
  const problems = content.tasks.some((t) => t.situation.trim() !== '') ? validateLetter(content) : [];

  function setTask(taskIndex: number, task: LetterTask) {
    const tasks = [...content.tasks];
    tasks[taskIndex] = task;
    onChange({ ...content, tasks });
  }

  return (
    <div className="flex flex-col gap-4">
      {content.tasks.map((task, ti) => {
        const name = content.tasks.length > 1 ? `Task ${ti === 0 ? 'A' : 'B'}` : 'Task';
        const label = `Exercise ${n} ${name.toLowerCase()}`;
        const setPoint = (pi: number, value: string) => {
          const leitpunkte = [...task.leitpunkte];
          leitpunkte[pi] = value;
          setTask(ti, { ...task, leitpunkte });
        };
        return (
          <fieldset key={ti} className="flex flex-col gap-3 rounded-md border p-3">
            <legend className="px-1 font-semibold">{name}</legend>
            <label className={FIELD_LABEL}>
              Situation (German)
              <Textarea
                aria-label={`${label} situation`}
                lang="de"
                value={task.situation}
                onChange={(e) => setTask(ti, { ...task, situation: e.target.value })}
              />
            </label>
            {task.leitpunkte.map((point, pi) => (
              <div key={pi} className="flex items-center gap-2">
                <Input
                  className={INPUT}
                  lang="de"
                  aria-label={`${label} Leitpunkt ${pi + 1}`}
                  placeholder={`Leitpunkt ${pi + 1}`}
                  value={point}
                  onChange={(e) => setPoint(pi, e.target.value)}
                />
                {task.leitpunkte.length > 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className={`${BTN} shrink-0 text-destructive hover:text-destructive`}
                    onClick={() => setTask(ti, { ...task, leitpunkte: task.leitpunkte.filter((_, i) => i !== pi) })}
                  >
                    <X aria-hidden />
                    Remove Leitpunkt {pi + 1}
                  </Button>
                )}
              </div>
            ))}
            {task.leitpunkte.length < 4 && (
              <Button
                type="button"
                variant="outline"
                className={`${BTN} self-start`}
                onClick={() => setTask(ti, { ...task, leitpunkte: [...task.leitpunkte, ''] })}
              >
                <Plus aria-hidden />
                Add Leitpunkt
              </Button>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <label className={FIELD_LABEL}>
                Register
                <NativeSelect
                  aria-label={`${label} register`}
                  value={task.register}
                  onChange={(e) => setTask(ti, { ...task, register: e.target.value as LetterRegister })}
                >
                  {REGISTERS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className={FIELD_LABEL}>
                Words (min)
                <Input
                  className={INPUT}
                  type="number"
                  min={1}
                  aria-label={`${label} minimum words`}
                  value={task.wordTarget.min}
                  onChange={(e) => setTask(ti, { ...task, wordTarget: { ...task.wordTarget, min: Number(e.target.value) } })}
                />
              </label>
              <label className={FIELD_LABEL}>
                Words (max)
                <Input
                  className={INPUT}
                  type="number"
                  min={1}
                  aria-label={`${label} maximum words`}
                  value={task.wordTarget.max}
                  onChange={(e) => setTask(ti, { ...task, wordTarget: { ...task.wordTarget, max: Number(e.target.value) } })}
                />
              </label>
            </div>
            {ti === 1 && (
              <Button
                type="button"
                variant="ghost"
                className={`${BTN} self-start text-destructive hover:text-destructive`}
                onClick={() => onChange({ ...content, tasks: content.tasks.slice(0, 1) })}
              >
                <Trash2 aria-hidden />
                Remove Task B
              </Button>
            )}
          </fieldset>
        );
      })}
      {content.tasks.length === 1 && (
        <Button
          type="button"
          variant="outline"
          className={`${BTN} self-start`}
          onClick={() => onChange({ ...content, tasks: [...content.tasks, blankLetterTask()] })}
        >
          <Plus aria-hidden />
          Add Task B
        </Button>
      )}
      {problems.length > 0 && (
        <ul className={HINT} aria-label={`Exercise ${n} letter problems`}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
