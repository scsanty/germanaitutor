'use client';

import type {
  ExerciseType,
  ExerciseContent,
  MultipleChoiceContent,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
} from '@/lib/curriculum/types';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { BTN, FOCUS, INPUT } from './adminStyles';

export interface ExerciseFormEntry {
  id?: string;
  type: ExerciseType;
  content: ExerciseContent;
}

function blankContentFor(type: ExerciseType): ExerciseContent {
  switch (type) {
    case 'multiple_choice':
      return { question: '', options: ['', ''], correctIndex: 0 };
    case 'fill_blank':
      return { textWithBlank: '', correctAnswer: '' };
    case 'flashcard':
      return { front: '', back: '' };
    case 'free_text':
      return { prompt: '', modelAnswer: '' };
  }
}

export function ExerciseEditor({
  exercises,
  onChange,
  allowFlashcards = true,
}: {
  exercises: ExerciseFormEntry[];
  onChange: (exercises: ExerciseFormEntry[]) => void;
  allowFlashcards?: boolean;
}) {
  function updateAt(index: number, entry: ExerciseFormEntry) {
    const next = [...exercises];
    next[index] = entry;
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(exercises.filter((_, i) => i !== index));
  }

  function addExercise() {
    const type: ExerciseType = allowFlashcards ? 'flashcard' : 'multiple_choice';
    onChange([...exercises, { type, content: blankContentFor(type) }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Exercises ({exercises.length})</h3>
      {exercises.map((exercise, index) => (
        <Card key={exercise.id ?? `new-${index}`} className="min-w-0 gap-4">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <NativeSelect
                wrapperClassName="w-full sm:w-64"
                aria-label={`Exercise ${index + 1} type`}
                value={exercise.type}
                onChange={(e) => {
                  const type = e.target.value as ExerciseType;
                  updateAt(index, { ...exercise, type, content: blankContentFor(type) });
                }}
              >
                <option value="multiple_choice">Multiple choice</option>
                <option value="fill_blank">Fill in the blank</option>
                {(allowFlashcards || exercise.type === 'flashcard') && <option value="flashcard">Flashcard</option>}
                <option value="free_text">Free text</option>
              </NativeSelect>
              <Button type="button" variant="ghost" className={`${BTN} text-destructive hover:text-destructive`} onClick={() => removeAt(index)}>
                <Trash2 aria-hidden />
                Remove exercise {index + 1}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ExerciseContentFields
              type={exercise.type}
              content={exercise.content}
              index={index}
              onChange={(content) => updateAt(index, { ...exercise, content })}
            />
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={addExercise}>
        <Plus aria-hidden />
        Add exercise
      </Button>
    </div>
  );
}

// One exercise's content form, shared by the lesson editor and the practice review list.
export function ExerciseContentFields({
  type,
  content,
  index,
  onChange,
  allowInstruction = true,
}: {
  type: ExerciseType;
  content: ExerciseContent;
  index: number;
  onChange: (content: ExerciseContent) => void;
  // False for the German-only practice pool.
  allowInstruction?: boolean;
}) {
  return (
    <>
      {typeSpecificFields(type, content, index, onChange)}
      {allowInstruction && type !== 'flashcard' && (
        <InstructionFields
          value={(content as { instruction?: { en: string; de: string } }).instruction}
          index={index}
          onChange={(instruction) => {
            const { instruction: _old, ...rest } = content as unknown as Record<string, unknown>;
            onChange((instruction ? { ...rest, instruction } : rest) as unknown as ExerciseContent);
          }}
        />
      )}
    </>
  );
}

function typeSpecificFields(type: ExerciseType, content: ExerciseContent, index: number, onChange: (content: ExerciseContent) => void) {
  switch (type) {
    case 'multiple_choice':
      return <MultipleChoiceFields content={content as MultipleChoiceContent} index={index} onChange={onChange} />;
    case 'fill_blank':
      return <FillBlankFields content={content as FillBlankContent} index={index} onChange={onChange} />;
    case 'flashcard':
      return <FlashcardFields content={content as FlashcardContent} index={index} onChange={onChange} />;
    case 'free_text':
      return <FreeTextFields content={content as FreeTextContent} index={index} onChange={onChange} />;
  }
}

function InstructionFields({
  value,
  index,
  onChange,
}: {
  value: { en: string; de: string } | undefined;
  index: number;
  onChange: (instruction: { en: string; de: string } | undefined) => void;
}) {
  const current = value ?? { en: '', de: '' };
  // Spec: both empty means no instruction; the key is removed, never stored empty (Review Focus 4).
  const emit = (next: { en: string; de: string }) => onChange(next.en === '' && next.de === '' ? undefined : next);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} instruction (English)`}
        placeholder="Instruction (English)"
        value={current.en}
        onChange={(e) => emit({ ...current, en: e.target.value })}
      />
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} instruction (German)`}
        placeholder="Instruction (German)"
        value={current.de}
        onChange={(e) => emit({ ...current, de: e.target.value })}
      />
    </div>
  );
}

function MultipleChoiceFields({
  content,
  index,
  onChange,
}: {
  content: MultipleChoiceContent;
  index: number;
  onChange: (content: MultipleChoiceContent) => void;
}) {
  function updateOption(optionIndex: number, value: string) {
    const options = [...content.options];
    options[optionIndex] = value;
    onChange({ ...content, options });
  }

  function removeOption(optionIndex: number) {
    const options = content.options.filter((_, i) => i !== optionIndex);
    let correctIndex = content.correctIndex;
    if (optionIndex === content.correctIndex) {
      correctIndex = 0;
    } else if (optionIndex < content.correctIndex) {
      correctIndex = content.correctIndex - 1;
    }
    onChange({ ...content, options, correctIndex });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} question`}
        value={content.question}
        onChange={(e) => onChange({ ...content, question: e.target.value })}
        placeholder="Question"
      />
      {content.options.map((option, optionIndex) => (
        <div key={optionIndex} className="flex items-center gap-2">
          <Input
            className={INPUT}
            aria-label={`Exercise ${index + 1} option ${optionIndex + 1}`}
            value={option}
            onChange={(e) => updateOption(optionIndex, e.target.value)}
            placeholder={`Option ${optionIndex + 1}`}
          />
          <span className="grid size-11 shrink-0 place-items-center">
            <input
              type="radio"
              className={`size-5 accent-primary ${FOCUS} rounded-full`}
              aria-label={`Exercise ${index + 1} option ${optionIndex + 1} is correct`}
              checked={content.correctIndex === optionIndex}
              onChange={() => onChange({ ...content, correctIndex: optionIndex })}
            />
          </span>
          <Button type="button" variant="ghost" className={`${BTN} shrink-0 text-destructive hover:text-destructive`} onClick={() => removeOption(optionIndex)}>
            <X aria-hidden />
            Remove option
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className={`${BTN} self-start`} onClick={() => onChange({ ...content, options: [...content.options, ''] })}>
        <Plus aria-hidden />
        Add option
      </Button>
    </div>
  );
}

function FillBlankFields({
  content,
  index,
  onChange,
}: {
  content: FillBlankContent;
  index: number;
  onChange: (content: FillBlankContent) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} text with blank`}
        value={content.textWithBlank}
        onChange={(e) => onChange({ ...content, textWithBlank: e.target.value })}
        placeholder="Text with blank"
      />
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} correct answer`}
        value={content.correctAnswer}
        onChange={(e) => onChange({ ...content, correctAnswer: e.target.value })}
        placeholder="Correct answer"
      />
    </div>
  );
}

function FlashcardFields({
  content,
  index,
  onChange,
}: {
  content: FlashcardContent;
  index: number;
  onChange: (content: FlashcardContent) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} front`}
        value={content.front}
        onChange={(e) => onChange({ ...content, front: e.target.value })}
        placeholder="Front"
      />
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} back`}
        value={content.back}
        onChange={(e) => onChange({ ...content, back: e.target.value })}
        placeholder="Back"
      />
    </div>
  );
}

function FreeTextFields({
  content,
  index,
  onChange,
}: {
  content: FreeTextContent;
  index: number;
  onChange: (content: FreeTextContent) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} prompt`}
        value={content.prompt}
        onChange={(e) => onChange({ ...content, prompt: e.target.value })}
        placeholder="Prompt"
      />
      <Input
        className={INPUT}
        aria-label={`Exercise ${index + 1} model answer`}
        value={content.modelAnswer}
        onChange={(e) => onChange({ ...content, modelAnswer: e.target.value })}
        placeholder="Model answer"
      />
    </div>
  );
}
