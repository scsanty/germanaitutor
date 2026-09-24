'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  PlacementAnswer,
  PlacementOutcome,
  PlacementQuestionView,
  PlacementState,
} from '@/lib/tutoring/placementTypes';

type Phase = 'intro' | 'question' | 'result';

export function PlacementTest({ onFinished, onSkip }: { onFinished: () => void; onSkip?: () => void }) {
  const t = useTranslations('placement');
  const [phase, setPhase] = useState<Phase>('intro');
  const [question, setQuestion] = useState<PlacementQuestionView | null>(null);
  const [outcome, setOutcome] = useState<PlacementOutcome | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyState(state: PlacementState) {
    setError(null);
    if (state.status === 'finished') {
      setOutcome(state.outcome);
      setQuestion(null);
      setPhase('result');
      return;
    }
    setQuestion(state.question);
    setSelectedIndex(null);
    setText('');
    setPhase('question');
  }

  async function send(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applyState(data as PlacementState);
      } else {
        const detail = typeof data.error === 'string' ? data.error : String(res.status);
        setError(res.status === 502 ? t('gradingFailed', { error: detail }) : t('genericError', { error: detail }));
      }
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function currentAnswer(): PlacementAnswer | null {
    if (!question) return null;
    if (question.type === 'multiple_choice') {
      return selectedIndex === null ? null : { type: 'multiple_choice', selectedIndex };
    }
    const trimmed = text.trim();
    if (!trimmed) return null;
    return question.type === 'fill_blank' ? { type: 'fill_blank', text: trimmed } : { type: 'free_text', text: trimmed };
  }

  if (phase === 'intro') {
    return (
      <div>
        <h2>{t('title')}</h2>
        <p>{t('intro')}</p>
        <button type="button" onClick={() => send('/api/placement/start')} disabled={busy}>
          {t('start')}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} disabled={busy}>
            {t('skip')}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (phase === 'question' && question) {
    const answer = currentAnswer();
    return (
      <div>
        <p>{t('questionOf', { current: question.position, total: question.total })}</p>
        {question.type === 'multiple_choice' && (
          <fieldset>
            <legend>{question.question}</legend>
            {question.options.map((option, index) => (
              <label key={index}>
                <input
                  type="radio"
                  name="placement-option"
                  checked={selectedIndex === index}
                  onChange={() => setSelectedIndex(index)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        )}
        {question.type === 'fill_blank' && (
          <div>
            <p>{question.textWithBlank}</p>
            <input aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        {question.type === 'free_text' && (
          <div>
            <p>{question.prompt}</p>
            <textarea aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <button
          type="button"
          disabled={busy || answer === null}
          onClick={() => answer && send('/api/placement/answer', { questionId: question.id, answer })}
        >
          {busy ? t('submitting') : t('submit')}
        </button>
        <button type="button" disabled={busy} onClick={() => send('/api/placement/stop')}>
          {t('beyond')}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (!outcome) return null;
  return (
    <div>
      <h2>{t('resultTitle')}</h2>
      <p>{t('placedAt', { level: outcome.placedLevel })}</p>
      <p>{t('score', { score: outcome.score, max: outcome.maxScore })}</p>
      <p>{t(`stopReason.${outcome.stopReason}`)}</p>
      <h3>{t('review')}</h3>
      <ol>
        {outcome.answers.map((a) => (
          <li key={a.questionId}>
            <p>{a.question}</p>
            <p>
              {t('given', { answer: a.given || t('noAnswer') })} — {t(`result.${a.result}`)}
            </p>
            <p>
              {a.type === 'free_text'
                ? t('modelAnswer', { answer: a.correctAnswer })
                : t('correctAnswer', { answer: a.correctAnswer })}
            </p>
            {a.feedback && <p>{t('feedback', { feedback: a.feedback })}</p>}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onFinished}>
        {t('continue')}
      </button>
    </div>
  );
}
