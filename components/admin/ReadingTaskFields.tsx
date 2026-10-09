'use client';

import { useState } from 'react';
import type { ClozeContent, MatchingContent, PassageQuestionsContent } from '@/lib/curriculum/types';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { BTN, FIELD_LABEL, FOCUS, HINT, INPUT } from './adminStyles';

// Editor forms for the reading task types (passage + questions, matching, cloze). Labels follow the
// rest of the editor: "Exercise n …", English-only like the whole admin area.

const letterOf = (i: number) => 'abcdefghijklmnopqrstuvwxyz'[i] ?? String(i + 1);
const REMOVE = `${BTN} shrink-0 text-destructive hover:text-destructive`;
const RADIO = `size-5 accent-primary ${FOCUS} rounded-full`;

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((old, i) => (i === index ? value : old));
}

// An index into a list that lost the entry at `removed`: the removed entry falls back to 0.
function shiftIndex(value: number, removed: number): number {
  if (value === removed) return 0;
  return value > removed ? value - 1 : value;
}

function TextList({
  values,
  label,
  addLabel,
  removeLabel,
  min,
  prefix,
  onChange,
  onRemove,
}: {
  values: string[];
  label: (i: number) => string;
  addLabel: string;
  removeLabel: string;
  min: number;
  prefix?: (i: number) => string;
  onChange: (values: string[]) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          {prefix && <span className="w-5 shrink-0 font-semibold">{prefix(i)}</span>}
          <Input className={INPUT} aria-label={label(i)} placeholder={label(i)} value={value} onChange={(e) => onChange(replaceAt(values, i, e.target.value))} />
          {values.length > min && (
            <Button type="button" variant="ghost" className={REMOVE} onClick={() => (onRemove ? onRemove(i) : onChange(values.filter((_, j) => j !== i)))}>
              <X aria-hidden />
              {removeLabel}
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={() => onChange([...values, ''])}>
        <Plus aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

export function PassageQuestionsFields({ content, index, onChange }: { content: PassageQuestionsContent; index: number; onChange: (content: PassageQuestionsContent) => void }) {
  const n = index + 1;
  type Question = PassageQuestionsContent['questions'][number];
  const setQuestion = (qi: number, q: Question) => onChange({ ...content, questions: replaceAt(content.questions, qi, q) });
  return (
    <div className="flex flex-col gap-4">
      <label className={FIELD_LABEL}>
        Passage
        <Textarea aria-label={`Exercise ${n} passage`} className="min-h-40" value={content.passage} onChange={(e) => onChange({ ...content, passage: e.target.value })} />
      </label>
      {content.questions.map((q, qi) => (
        <fieldset key={qi} className="flex flex-col gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">Question {qi + 1}</legend>
          <Input className={INPUT} aria-label={`Exercise ${n} question ${qi + 1}`} placeholder="Question" value={q.question} onChange={(e) => setQuestion(qi, { ...q, question: e.target.value })} />
          {q.options.map((option, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <Input
                className={INPUT}
                aria-label={`Exercise ${n} question ${qi + 1} option ${oi + 1}`}
                placeholder={`Option ${oi + 1}`}
                value={option}
                onChange={(e) => setQuestion(qi, { ...q, options: replaceAt(q.options, oi, e.target.value) })}
              />
              <span className="grid size-11 shrink-0 place-items-center">
                <input
                  type="radio"
                  className={RADIO}
                  aria-label={`Exercise ${n} question ${qi + 1} option ${oi + 1} is correct`}
                  checked={q.correctIndex === oi}
                  onChange={() => setQuestion(qi, { ...q, correctIndex: oi })}
                />
              </span>
              {q.options.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  className={REMOVE}
                  onClick={() => setQuestion(qi, { ...q, options: q.options.filter((_, j) => j !== oi), correctIndex: shiftIndex(q.correctIndex, oi) })}
                >
                  <X aria-hidden />
                  Remove option
                </Button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={BTN} onClick={() => setQuestion(qi, { ...q, options: [...q.options, ''] })}>
              <Plus aria-hidden />
              Add option
            </Button>
            {content.questions.length > 1 && (
              <Button type="button" variant="ghost" className={REMOVE} onClick={() => onChange({ ...content, questions: content.questions.filter((_, j) => j !== qi) })}>
                <X aria-hidden />
                Remove question {qi + 1}
              </Button>
            )}
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className={`${BTN} self-start`}
        onClick={() => onChange({ ...content, questions: [...content.questions, { question: '', options: ['', ''], correctIndex: 0 }] })}
      >
        <Plus aria-hidden />
        Add question
      </Button>
    </div>
  );
}

export function MatchingFields({ content, index, onChange }: { content: MatchingContent; index: number; onChange: (content: MatchingContent) => void }) {
  const n = index + 1;
  const removeTarget = (ti: number) =>
    onChange({
      ...content,
      targets: content.targets.filter((_, j) => j !== ti),
      answers: content.answers.map((a) => (a === null ? null : shiftIndex(a, ti))),
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Texts (items)</p>
        {content.items.map((item, ii) => {
          const answer = content.answers[ii];
          return (
            <div key={ii} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
              <span className="w-5 shrink-0 font-semibold">{ii + 1}</span>
              <Input
                className={INPUT}
                aria-label={`Exercise ${n} item ${ii + 1}`}
                placeholder={`Item ${ii + 1}`}
                value={item}
                onChange={(e) => onChange({ ...content, items: replaceAt(content.items, ii, e.target.value) })}
              />
              <NativeSelect
                wrapperClassName="w-full sm:w-56"
                aria-label={`Exercise ${n} item ${ii + 1} answer`}
                value={answer === null ? 'x' : String(answer ?? 0)}
                onChange={(e) => onChange({ ...content, answers: replaceAt(content.answers, ii, e.target.value === 'x' ? null : Number(e.target.value)) })}
              >
                {content.targets.map((target, ti) => (
                  <option key={ti} value={String(ti)}>
                    {letterOf(ti)} {target}
                  </option>
                ))}
                {content.allowNone && <option value="x">x (none)</option>}
              </NativeSelect>
              {content.items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className={REMOVE}
                  onClick={() => onChange({ ...content, items: content.items.filter((_, j) => j !== ii), answers: content.answers.filter((_, j) => j !== ii) })}
                >
                  <X aria-hidden />
                  Remove item {ii + 1}
                </Button>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={() => onChange({ ...content, items: [...content.items, ''], answers: [...content.answers, 0] })}>
          <Plus aria-hidden />
          Add item
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Options (targets)</p>
        <TextList
          values={content.targets}
          label={(ti) => `Exercise ${n} target ${letterOf(ti)}`}
          prefix={letterOf}
          addLabel="Add target"
          removeLabel="Remove target"
          min={2}
          onChange={(targets) => onChange({ ...content, targets })}
          onRemove={removeTarget}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className={`size-5 accent-primary ${FOCUS}`}
          checked={content.allowNone}
          // Unticking turns any "none" answer back into the first target, so the content stays valid.
          onChange={(e) => onChange({ ...content, allowNone: e.target.checked, answers: e.target.checked ? content.answers : content.answers.map((a) => a ?? 0) })}
        />
        Allow none (x)
      </label>
    </div>
  );
}

type ClozeGap = ClozeContent['gaps'][number];
type GapMode = ClozeGap['mode'];

function blankGap(mode: GapMode): ClozeGap {
  if (mode === 'select') return { mode, options: ['', ''], correctIndex: 0 };
  if (mode === 'bank') return { mode, answer: 0 };
  return { mode, answer: '' };
}

// Comma-separated variants: the raw text stays local while typing, so "a, " keeps its comma.
function VariantsInput({ label, value, onChange }: { label: string; value: string[] | undefined; onChange: (variants: string[] | undefined) => void }) {
  const [raw, setRaw] = useState((value ?? []).join(', '));
  return (
    <Input
      className={INPUT}
      aria-label={label}
      placeholder="Also accepted (comma-separated)"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const variants = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
        onChange(variants.length > 0 ? variants : undefined);
      }}
    />
  );
}

export function ClozeFields({ content, index, onChange }: { content: ClozeContent; index: number; onChange: (content: ClozeContent) => void }) {
  const n = index + 1;
  // The bank is kept only while some gap uses it.
  const emit = (gaps: ClozeGap[], bank = content.bank) => {
    const { bank: _old, ...rest } = content;
    const usesBank = gaps.some((g) => g.mode === 'bank');
    onChange(usesBank ? { ...rest, gaps, bank: bank && bank.length > 0 ? bank : ['', ''] } : { ...rest, gaps });
  };
  const setGap = (gi: number, gap: ClozeGap) => emit(replaceAt(content.gaps, gi, gap));
  const bank = content.bank ?? [];
  const usesBank = content.gaps.some((g) => g.mode === 'bank');
  return (
    <div className="flex flex-col gap-4">
      <label className={FIELD_LABEL}>
        {'Text (use {{1}}, {{2}} … for gaps)'}
        <Textarea className="min-h-32" value={content.text} onChange={(e) => onChange({ ...content, text: e.target.value })} />
      </label>
      <p className={HINT}>Gap n in the list fills the marker {'{{n}}'} in the text.</p>
      {content.gaps.map((gap, gi) => {
        const name = `Exercise ${n} gap ${gi + 1}`;
        return (
          <fieldset key={gi} className="flex flex-col gap-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">Gap {gi + 1}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect wrapperClassName="w-full sm:w-48" aria-label={`${name} mode`} value={gap.mode} onChange={(e) => setGap(gi, blankGap(e.target.value as GapMode))}>
                <option value="typed">Typed</option>
                <option value="select">Select</option>
                <option value="bank">Word bank</option>
              </NativeSelect>
              <Button type="button" variant="ghost" className={REMOVE} onClick={() => emit(content.gaps.filter((_, j) => j !== gi))}>
                <X aria-hidden />
                Remove gap {gi + 1}
              </Button>
            </div>
            {gap.mode === 'typed' && (
              <div className="grid gap-2 md:grid-cols-2">
                <Input className={INPUT} aria-label={`${name} answer`} placeholder="Answer (case-sensitive)" value={gap.answer} onChange={(e) => setGap(gi, { ...gap, answer: e.target.value })} />
                <VariantsInput
                  label={`${name} variants`}
                  value={gap.variants}
                  onChange={(variants) => {
                    const { variants: _old, ...rest } = gap;
                    setGap(gi, variants ? { ...rest, variants } : rest);
                  }}
                />
              </div>
            )}
            {gap.mode === 'select' && (
              <>
                {gap.options.map((option, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input
                      className={INPUT}
                      aria-label={`${name} option ${oi + 1}`}
                      placeholder={`Option ${oi + 1}`}
                      value={option}
                      onChange={(e) => setGap(gi, { ...gap, options: replaceAt(gap.options, oi, e.target.value) })}
                    />
                    <span className="grid size-11 shrink-0 place-items-center">
                      <input type="radio" className={RADIO} aria-label={`${name} option ${oi + 1} is correct`} checked={gap.correctIndex === oi} onChange={() => setGap(gi, { ...gap, correctIndex: oi })} />
                    </span>
                    {gap.options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className={REMOVE}
                        onClick={() => setGap(gi, { ...gap, options: gap.options.filter((_, j) => j !== oi), correctIndex: shiftIndex(gap.correctIndex, oi) })}
                      >
                        <X aria-hidden />
                        Remove option
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={() => setGap(gi, { ...gap, options: [...gap.options, ''] })}>
                  <Plus aria-hidden />
                  Add option
                </Button>
              </>
            )}
            {gap.mode === 'bank' && (
              <NativeSelect wrapperClassName="w-full sm:w-56" aria-label={`${name} bank word`} value={String(gap.answer)} onChange={(e) => setGap(gi, { ...gap, answer: Number(e.target.value) })}>
                {bank.map((word, wi) => (
                  <option key={wi} value={String(wi)}>
                    {letterOf(wi)} {word}
                  </option>
                ))}
              </NativeSelect>
            )}
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={() => emit([...content.gaps, blankGap('typed')])}>
        <Plus aria-hidden />
        Add gap
      </Button>
      {usesBank && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Word bank</p>
          <TextList
            values={bank}
            label={(wi) => `Exercise ${n} bank word ${letterOf(wi)}`}
            prefix={letterOf}
            addLabel="Add word"
            removeLabel="Remove word"
            min={1}
            onChange={(next) => emit(content.gaps, next)}
            onRemove={(wi) =>
              emit(
                content.gaps.map((g) => (g.mode === 'bank' ? { ...g, answer: shiftIndex(g.answer, wi) } : g)),
                bank.filter((_, j) => j !== wi)
              )
            }
          />
        </div>
      )}
    </div>
  );
}
