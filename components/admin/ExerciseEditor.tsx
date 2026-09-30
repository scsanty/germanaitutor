'use client';

import type {
  ExerciseType,
  ExerciseContent,
  MultipleChoiceContent,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
} from '@/lib/curriculum/types';

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
    <div>
      <h3>Exercises ({exercises.length})</h3>
      {exercises.map((exercise, index) => (
        <div key={exercise.id ?? `new-${index}`}>
          <select
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
          </select>

          <ExerciseContentFields
            type={exercise.type}
            content={exercise.content}
            index={index}
            onChange={(content) => updateAt(index, { ...exercise, content })}
          />

          <button type="button" onClick={() => removeAt(index)}>
            Remove exercise {index + 1}
          </button>
        </div>
      ))}
      <button type="button" onClick={addExercise}>
        Add exercise
      </button>
    </div>
  );
}

// One exercise's content form, shared by the lesson editor and the practice review list.
export function ExerciseContentFields({
  type,
  content,
  index,
  onChange,
}: {
  type: ExerciseType;
  content: ExerciseContent;
  index: number;
  onChange: (content: ExerciseContent) => void;
}) {
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
    <div>
      <input
        aria-label={`Exercise ${index + 1} question`}
        value={content.question}
        onChange={(e) => onChange({ ...content, question: e.target.value })}
        placeholder="Question"
      />
      {content.options.map((option, optionIndex) => (
        <div key={optionIndex}>
          <input
            aria-label={`Exercise ${index + 1} option ${optionIndex + 1}`}
            value={option}
            onChange={(e) => updateOption(optionIndex, e.target.value)}
            placeholder={`Option ${optionIndex + 1}`}
          />
          <input
            type="radio"
            aria-label={`Exercise ${index + 1} option ${optionIndex + 1} is correct`}
            checked={content.correctIndex === optionIndex}
            onChange={() => onChange({ ...content, correctIndex: optionIndex })}
          />
          <button type="button" onClick={() => removeOption(optionIndex)}>
            Remove option
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...content, options: [...content.options, ''] })}>
        Add option
      </button>
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
    <div>
      <input
        aria-label={`Exercise ${index + 1} text with blank`}
        value={content.textWithBlank}
        onChange={(e) => onChange({ ...content, textWithBlank: e.target.value })}
        placeholder="Text with blank"
      />
      <input
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
    <div>
      <input
        aria-label={`Exercise ${index + 1} front`}
        value={content.front}
        onChange={(e) => onChange({ ...content, front: e.target.value })}
        placeholder="Front"
      />
      <input
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
    <div>
      <input
        aria-label={`Exercise ${index + 1} prompt`}
        value={content.prompt}
        onChange={(e) => onChange({ ...content, prompt: e.target.value })}
        placeholder="Prompt"
      />
      <input
        aria-label={`Exercise ${index + 1} model answer`}
        value={content.modelAnswer}
        onChange={(e) => onChange({ ...content, modelAnswer: e.target.value })}
        placeholder="Model answer"
      />
    </div>
  );
}
