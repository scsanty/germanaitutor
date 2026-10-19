'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { GermanTextarea } from '@/components/typing/GermanTextarea';
import { WordCounter } from '@/components/typing/WordCounter';
import type { LetterAnswer, LetterContent } from '@/lib/tasks/letter';

// Spec: the letter task. With two tasks they are cards to choose from (the choice can change until
// submit, and keeps the text); then the chosen task's situation and Leitpunkte, the textarea with its
// umlaut row and a word counter. Spellcheck is off only when timed (Teil runner and mocks, S9).
export function LetterTaskInput({
  content,
  value,
  onChange,
  timed,
  disabled = false,
}: {
  content: LetterContent;
  value: LetterAnswer;
  onChange: (value: LetterAnswer) => void;
  timed: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('writing');
  const id = useId();
  const task = content.tasks[value.taskIndex] ?? content.tasks[0];
  const choice = content.tasks.length > 1;
  if (!task) return null;

  return (
    <div className="flex flex-col gap-4">
      {choice ? (
        <RadioGroup
          aria-label={t('chooseTask')}
          value={String(value.taskIndex)}
          onValueChange={(v) => onChange({ ...value, taskIndex: Number(v) })}
          disabled={disabled}
          className="grid gap-3 md:grid-cols-2"
        >
          {content.tasks.map((option, i) => (
            <div
              key={i}
              className="relative flex items-start gap-3 rounded-xl border-2 border-border bg-surface-raised px-4 py-3 transition-colors duration-150 hover:border-primary/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring motion-reduce:transition-none"
            >
              <RadioGroupItem id={`${id}-task-${i}`} value={String(i)} aria-describedby={`${id}-situation-${i}`} className="mt-1 size-5 focus-visible:ring-0" />
              {/* The label's ::after stretches over the card, so the whole card is the tap target. */}
              <label htmlFor={`${id}-task-${i}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 after:absolute after:inset-0 after:content-['']">
                <span className="font-heading font-bold">{i === 0 ? t('taskA') : t('taskB')}</span>
                <span id={`${id}-situation-${i}`} lang="de" className="text-sm leading-relaxed whitespace-pre-wrap">
                  {option.situation}
                </span>
              </label>
            </div>
          ))}
        </RadioGroup>
      ) : (
        <p lang="de" className="text-lg leading-relaxed font-semibold whitespace-pre-wrap">
          {task.situation}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <p id={`${id}-points`} className="text-sm font-semibold">
          {t('leitpunkte')}
        </p>
        <ul lang="de" aria-labelledby={`${id}-points`} className="list-disc pl-6 leading-relaxed">
          {task.leitpunkte.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-text`} className="text-sm font-medium">
          {t('yourLetter')}
        </label>
        <GermanTextarea
          id={`${id}-text`}
          lang="de"
          rows={10}
          value={value.text}
          maxLength={6000}
          disabled={disabled}
          spellCheck={timed ? false : undefined}
          aria-describedby={`${id}-count`}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="min-h-56 text-base leading-relaxed md:text-base"
        />
        <WordCounter id={`${id}-count`} text={value.text} target={task.wordTarget} />
      </div>
    </div>
  );
}
