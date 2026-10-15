'use client';

import { Fragment, useId } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ClozeAnswer, ClozeView } from '@/lib/tasks/cloze';
import type { MatchingAnswer, MatchingView } from '@/lib/tasks/matching';
import type { PassageQuestionsAnswer, PassageQuestionsView } from '@/lib/tasks/passageQuestions';
import type { SetTaskType, TaskAnswer, TaskView } from '@/lib/tasks/taskTypes';

export type TaskPane = 'text' | 'tasks' | 'all';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const letterOf = (i: number) => LETTERS[i] ?? String(i + 1);
const GAP = /\{\{(\d+)\}\}/g;

// Answers start all-unanswered: null for passage questions and cloze gaps, -1 for matching.
export function emptyAnswer(type: SetTaskType, view: TaskView): TaskAnswer {
  if (type === 'passage_questions') return { type, selected: (view as PassageQuestionsView).questions.map(() => null) };
  if (type === 'matching') return { type, selected: (view as MatchingView).items.map(() => -1) };
  return { type: 'cloze', values: (view as ClozeView).gaps.map(() => null) };
}

export function answeredCount(answer: TaskAnswer): number {
  if (answer.type === 'cloze') return answer.values.filter((v) => v !== null && v !== '').length;
  if (answer.type === 'matching') return answer.selected.filter((s) => s !== -1).length;
  return answer.selected.filter((s) => s !== null).length;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div lang="de" className="flex flex-col gap-3 text-base leading-relaxed">
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p.trim()}
          </p>
        ))}
    </div>
  );
}

interface Props<V, A> {
  view: V;
  value: A;
  onChange: (value: A) => void;
  disabled?: boolean;
  pane: TaskPane;
  itemResults?: boolean[];
}

// S17: after a lesson check, a tick or cross per question, text or gap (named for screen readers).
function ItemMark({ results, index }: { results?: boolean[]; index: number }) {
  const t = useTranslations('exam');
  if (!results || results[index] === undefined) return null;
  const ok = results[index];
  const Icon = ok ? Check : X;
  return (
    <span className={`inline-flex items-center align-middle ${ok ? 'text-success' : 'text-danger'}`}>
      <Icon aria-hidden className="size-5" strokeWidth={3} />
      <span className="sr-only">{ok ? t('right') : t('wrong')}</span>
    </span>
  );
}

function PassageQuestions({ view, value, onChange, disabled, pane, itemResults }: Props<PassageQuestionsView, PassageQuestionsAnswer>) {
  const id = useId();
  return (
    <>
      {pane !== 'tasks' && <Paragraphs text={view.passage} />}
      {pane !== 'text' && (
        <ol className="flex flex-col gap-4">
          {view.questions.map((q, qi) => (
            <li key={qi} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p id={`${id}-q${qi}`} lang="de" className="font-medium leading-relaxed">
                  {qi + 1}. {q.question}
                </p>
                <ItemMark results={itemResults} index={qi} />
              </div>
              <RadioGroup
                aria-labelledby={`${id}-q${qi}`}
                value={value.selected[qi] === null ? '' : String(value.selected[qi])}
                onValueChange={(v) => onChange({ ...value, selected: value.selected.map((s, i) => (i === qi ? Number(v) : s)) })}
                disabled={disabled}
                className="gap-1"
              >
                {q.options.map((option, oi) => (
                  <div key={oi} className="flex items-center gap-3">
                    <RadioGroupItem id={`${id}-q${qi}-o${oi}`} value={String(oi)} className="size-5" />
                    <label htmlFor={`${id}-q${qi}-o${oi}`} lang="de" className="flex-1 py-2 text-base">
                      {option}
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Matching({ view, value, onChange, disabled, pane, itemResults }: Props<MatchingView, MatchingAnswer>) {
  const t = useTranslations('exam');
  const id = useId();
  const pick = (index: number, raw: string) =>
    onChange({ ...value, selected: value.selected.map((s, i) => (i === index ? (raw === '' ? -1 : raw === 'x' ? null : Number(raw)) : s)) });
  return (
    <>
      {pane !== 'tasks' && (
        <ol lang="de" className="flex flex-col gap-3">
          {view.targets.map((target, ti) => (
            <li key={ti} className="flex gap-3 rounded-xl border border-border px-4 py-3 leading-relaxed">
              <span className="font-heading font-bold">{letterOf(ti)}</span>
              <span className="flex-1 whitespace-pre-wrap">{target}</span>
            </li>
          ))}
        </ol>
      )}
      {pane !== 'text' && (
        <ol className="flex flex-col gap-4">
          {view.items.map((item, ii) => {
            const s = value.selected[ii];
            return (
              <li key={ii} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <label htmlFor={`${id}-i${ii}`} lang="de" className="font-medium leading-relaxed whitespace-pre-wrap">
                    {ii + 1}. {item}
                  </label>
                  <ItemMark results={itemResults} index={ii} />
                </div>
                <NativeSelect id={`${id}-i${ii}`} value={s === -1 ? '' : s === null ? 'x' : String(s)} onChange={(e) => pick(ii, e.target.value)} disabled={disabled}>
                  <option value="">{t('unanswered')}</option>
                  {view.targets.map((_, ti) => (
                    <option key={ti} value={String(ti)}>
                      {letterOf(ti)}
                    </option>
                  ))}
                  {view.allowNone && <option value="x">{t('none')}</option>}
                </NativeSelect>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function Cloze({ view, value, onChange, disabled, pane, itemResults }: Props<ClozeView, ClozeAnswer>) {
  const t = useTranslations('exam');
  const id = useId();
  const set = (index: number, v: string | number | null) => onChange({ ...value, values: value.values.map((old, i) => (i === index ? v : old)) });
  const parts = view.text.split(GAP);
  const usesBank = !!view.bank && view.gaps.some((g) => g.mode === 'bank');
  return (
    <>
      {pane !== 'tasks' && usesBank && (
        <section aria-labelledby={`${id}-bank`} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
          <h3 id={`${id}-bank`} className="text-sm font-semibold text-text-muted">
            {t('wordBank')}
          </h3>
          <ul lang="de" className="flex flex-wrap gap-x-4 gap-y-1">
            {view.bank!.map((word, wi) => (
              <li key={wi}>
                <span className="font-bold">{letterOf(wi)}</span> {word}
              </li>
            ))}
          </ul>
        </section>
      )}
      {pane !== 'text' && (
        <div lang="de" className="text-base leading-[2.6] whitespace-pre-wrap">
          {parts.map((part, pi) => {
            // split() with a capture group alternates text and gap numbers.
            if (pi % 2 === 0) return <Fragment key={pi}>{part}</Fragment>;
            const gi = Number(part) - 1;
            const gap = view.gaps[gi];
            const v = value.values[gi];
            const label = t('gap', { n: gi + 1 });
            if (!gap) return <Fragment key={pi}>{`{{${part}}}`}</Fragment>;
            const mark = <ItemMark results={itemResults} index={gi} />;
            if (gap.mode === 'typed') {
              return (
                <Fragment key={pi}>
                  <Input
                    aria-label={label}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => set(gi, e.target.value === '' ? null : e.target.value)}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="mx-1 inline-block h-9 w-36 align-baseline"
                  />
                  {mark}
                </Fragment>
              );
            }
            const options = gap.mode === 'select' ? gap.options : (view.bank ?? []);
            return (
              <Fragment key={pi}>
                <NativeSelect
                  aria-label={label}
                  wrapperClassName="mx-1 inline-block w-auto min-w-28 align-baseline"
                  className="h-9"
                  value={typeof v === 'number' ? String(v) : ''}
                  onChange={(e) => set(gi, e.target.value === '' ? null : Number(e.target.value))}
                  disabled={disabled}
                >
                  <option value="">{`${gi + 1}: ${t('unanswered')}`}</option>
                  {options.map((o, oi) => (
                    <option key={oi} value={String(oi)}>
                      {gap.mode === 'bank' ? `${letterOf(oi)} ${o}` : o}
                    </option>
                  ))}
                </NativeSelect>
                {mark}
              </Fragment>
            );
          })}
        </div>
      )}
    </>
  );
}

// The inputs for the three Teil task types, shared by the exam runner and lessons. `pane` lets the
// runner put the reading text and the tasks in separate columns; lessons use 'all'.
export function TaskInputs({
  type,
  view,
  value,
  onChange,
  disabled,
  pane = 'all',
  itemResults,
}: {
  type: SetTaskType;
  view: TaskView;
  value: TaskAnswer;
  onChange: (value: TaskAnswer) => void;
  disabled?: boolean;
  pane?: TaskPane;
  // Lessons, after Check: one entry per item, shown as a tick or cross beside it.
  itemResults?: boolean[];
}) {
  // Each answer shape is a TaskAnswer, so the shared onChange accepts what every input sends.
  const common = { disabled, pane, onChange, itemResults };
  if (type === 'passage_questions') return <PassageQuestions {...common} view={view as PassageQuestionsView} value={value as PassageQuestionsAnswer} />;
  if (type === 'matching') return <Matching {...common} view={view as MatchingView} value={value as MatchingAnswer} />;
  return <Cloze {...common} view={view as ClozeView} value={value as ClozeAnswer} />;
}
