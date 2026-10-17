'use client';

import type { AudioQuestionsContent } from '@/lib/curriculum/types';
import { validateTask } from '@/lib/tasks/taskTypes';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FIELD_LABEL, HINT, INPUT } from './adminStyles';
import { QuestionList } from './ReadingTaskFields';

type Question = AudioQuestionsContent['questions'][number];

// The listening task (audio_questions): the spoken transcript and its questions, each with the words in
// the transcript that answer it (the evidence the reveal highlights). English-only like the admin area.
export function AudioQuestionsFields({
  content,
  index,
  onChange,
}: {
  content: AudioQuestionsContent;
  index: number;
  onChange: (content: AudioQuestionsContent) => void;
}) {
  const n = index + 1;
  const helpId = `exercise-${n}-transcript-help`;
  // The same checks the save runs; shown once a transcript is being written.
  const problems = content.transcript.trim() === '' ? [] : validateTask('audio_questions', content);

  function setEvidence(q: Question, set: (q: Question) => void, value: string) {
    const { evidence: _old, ...rest } = q;
    set(value === '' ? rest : { ...rest, evidence: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className={FIELD_LABEL}>
        Transcript
        <Textarea
          aria-label={`Exercise ${n} transcript`}
          aria-describedby={helpId}
          lang="de"
          className="min-h-40 font-mono text-sm"
          value={content.transcript}
          onChange={(e) => onChange({ ...content, transcript: e.target.value })}
        />
      </label>
      <div id={helpId} className={`${HINT} flex max-w-prose flex-col gap-1`}>
        <p>
          One line per speaker turn: the speaker&apos;s name and <code>m</code> or <code>f</code> in brackets, then what they say, for
          example <code>[Anna f] Wann fährt der Zug?</code>. Each speaker keeps their own voice.
        </p>
        <p>
          For a sound effect, start with a line <code>@filter phone</code>, <code>@filter station</code> or <code>@filter radio</code>.
          Students never see the transcript before they answer.
        </p>
      </div>
      <QuestionList
        questions={content.questions}
        index={index}
        onChange={(questions) => onChange({ ...content, questions })}
        extra={(q, qi, set) => (
          <Input
            className={INPUT}
            lang="de"
            aria-label={`Exercise ${n} question ${qi + 1} evidence`}
            placeholder="Evidence: the exact words in the transcript that answer it"
            value={q.evidence ?? ''}
            onChange={(e) => setEvidence(q, set, e.target.value)}
          />
        )}
      />
      <div aria-live="polite">
        {problems.length > 0 && (
          <div className="rounded-lg border border-destructive/40 p-3 text-sm">
            <p className="font-semibold">Fix before saving</p>
            <ul className="ml-5 list-disc">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
