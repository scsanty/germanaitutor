import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { axe, expectNoViolations } from '@/test/axe';
import { LESSON_LETTER_RUBRIC } from '@/lib/writing/rubric';
import type { LetterGrade } from '@/lib/writing/letterGrading';
import type { LetterAnswer, LetterContent } from '@/lib/tasks/letter';
import { MarkedText } from './MarkedText';
import { LetterResult } from './LetterResult';
import { LetterTaskInput } from './LetterTaskInput';

const TEXT = 'Liebe Anna, ich kann nicht komen, weil ich habe Arbeit. Bis bald!';
const at = (s: string) => ({ start: TEXT.indexOf(s), end: TEXT.indexOf(s) + s.length });

const GRADE: LetterGrade = {
  marks: [
    { ...at('komen'), original: 'komen', correction: 'kommen', type: 'spelling', category: 'spelling', reason: { en: 'Double m.', de: 'Doppel-m.' } },
    { ...at('weil ich habe Arbeit'), original: 'weil ich habe Arbeit', correction: 'weil ich arbeiten muss', type: 'grammar', category: 'word_order_subclause', reason: { en: 'The verb goes last.', de: 'Das Verb steht am Ende.' } },
  ],
  criteria: [
    { id: 'task', grade: 'B', justification: { en: 'One point is thin.', de: 'Ein Punkt ist knapp.' } },
    { id: 'communication', grade: 'B', justification: { en: 'Well organised.', de: 'Gut gegliedert.' } },
    { id: 'accuracy', grade: 'C', justification: { en: 'Several errors.', de: 'Mehrere Fehler.' } },
  ],
  points: 7,
  maxPoints: 15,
  percent: 47,
  corrected: 'Liebe Anna, ich kann nicht kommen, weil ich arbeiten muss. Bis bald!',
  summary: { en: 'A good start.', de: 'Ein guter Anfang.' },
};

const TWO_TASKS: LetterContent = {
  tasks: [
    { situation: 'Aufgabe A: Ihre Freundin hat Sie eingeladen.', leitpunkte: ['Dank', 'Absage', 'Vorschlag'], register: 'informal', wordTarget: { min: 30, max: 50 } },
    { situation: 'Aufgabe B: Sie beschweren sich beim Hotel.', leitpunkte: ['Aufenthalt', 'Problem', 'Erwartung'], register: 'formal', wordTarget: { min: 40, max: 60 } },
  ],
};

function Input({ timed = false, onChange = () => {} }: { timed?: boolean; onChange?: (v: LetterAnswer) => void }) {
  const [value, setValue] = useState<LetterAnswer>({ type: 'letter', taskIndex: 0, text: '' });
  return (
    <LetterTaskInput
      content={TWO_TASKS}
      value={value}
      timed={timed}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('MarkedText', () => {
  it('renders each mark as a button, and tapping one shows its correction, type and reason', async () => {
    renderWithIntl(<MarkedText text={TEXT} marks={GRADE.marks} />);
    const komen = screen.getByRole('button', { name: /komen/ });
    expect(screen.getByRole('button', { name: /weil ich habe Arbeit/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    // The text around the marks stays as written.
    expect(document.body.textContent).toContain('Liebe Anna, ich kann nicht komen, weil ich habe Arbeit. Bis bald!');
    fireEvent.click(komen);
    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('kommen')).toBeInTheDocument();
    expect(within(popover).getByText('Spelling')).toBeInTheDocument();
    expect(within(popover).getByText('Double m.')).toBeInTheDocument();
    fireEvent.click(within(popover).getByRole('button', { name: 'DE' }));
    expect(within(popover).getByText('Doppel-m.')).toBeInTheDocument();
  });
});

describe('LetterResult', () => {
  it('shows each criterion with its grade and points, the total, the summary, and the corrected version', () => {
    const onCopy = vi.fn();
    renderWithIntl(<LetterResult grade={GRADE} text={TEXT} rubric={LESSON_LETTER_RUBRIC} onCopyToFreestyle={onCopy} tips={[{ en: 'Answer every point.', de: 'Beantworte jeden Punkt.' }]} />);
    expect(screen.getByText('7 of 15 points (47%)')).toBeInTheDocument();
    const task = screen.getByRole('listitem', { name: 'Task completion' });
    expect(within(task).getByText('Grade B')).toBeInTheDocument();
    expect(within(task).getByText('3 of 5 points')).toBeInTheDocument();
    expect(within(task).getByText('One point is thin.')).toBeInTheDocument();
    expect(within(task).getByText('Tip: Answer every point.')).toBeInTheDocument();
    const accuracy = screen.getByRole('listitem', { name: 'Formal accuracy' });
    expect(within(accuracy).getByText('Grade C')).toBeInTheDocument();
    expect(within(accuracy).getByText('1 of 5 points')).toBeInTheDocument();
    expect(screen.getByText('A good start.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Ein guter Anfang.')).toBeInTheDocument();
    expect(within(task).getByText('Ein Punkt ist knapp.')).toBeInTheDocument();

    expect(screen.queryByText(GRADE.corrected)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Corrected version' }));
    expect(screen.getByText(GRADE.corrected)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy into free writing' }));
    expect(onCopy).toHaveBeenCalled();
  });

  // The zero rule: a lowest task grade makes the whole letter worth 0, and the result says why.
  it('shows 0 points and the reason when the zero rule applies, and no reason otherwise', () => {
    const zeroed = { ...LESSON_LETTER_RUBRIC, zeroesTextOn: { criterion: 'task', grade: 'D' as const } };
    const offTopic: LetterGrade = {
      ...GRADE,
      criteria: [{ ...GRADE.criteria[0], grade: 'D' }, GRADE.criteria[1], GRADE.criteria[2]],
      points: 0,
      percent: 0,
    };
    const { unmount } = renderWithIntl(<LetterResult grade={offTopic} text={TEXT} rubric={zeroed} />);
    expect(screen.getByText('0 of 15 points (0%)')).toBeInTheDocument();
    expect(screen.getByText('Task completion got the lowest grade, so the whole letter scores 0 points.')).toBeInTheDocument();
    // The cards keep each criterion's own grade and its own points; only the total is zeroed.
    const cards = screen.getAllByRole('listitem');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Task completion', 'Communicative design', 'Formal accuracy']);
    expect(within(cards[0]).getByText('Grade D')).toBeInTheDocument();
    expect(within(cards[0]).getByText('0 of 5 points')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Grade B')).toBeInTheDocument();
    expect(within(cards[1]).getByText('3 of 5 points')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Grade C')).toBeInTheDocument();
    expect(within(cards[2]).getByText('1 of 5 points')).toBeInTheDocument();
    unmount();
    renderWithIntl(<LetterResult grade={offTopic} text={TEXT} rubric={LESSON_LETTER_RUBRIC} />);
    expect(screen.queryByText(/whole letter scores 0/)).toBeNull();
  });

  it('shows the zero-rule reason in German', () => {
    const zeroed = { ...LESSON_LETTER_RUBRIC, zeroesTextOn: { criterion: 'task', grade: 'D' as const } };
    const offTopic: LetterGrade = { ...GRADE, criteria: [{ ...GRADE.criteria[0], grade: 'D' }, GRADE.criteria[1], GRADE.criteria[2]], points: 0, percent: 0 };
    renderWithIntl(<LetterResult grade={offTopic} text={TEXT} rubric={zeroed} />, 'de');
    expect(screen.getByText('Aufgabenbewältigung hat die niedrigste Bewertung, deshalb zählt der ganze Text 0 Punkte.')).toBeInTheDocument();
  });

  it('has no copy button without onCopyToFreestyle, and no axe violations', async () => {
    const { container } = renderWithIntl(<LetterResult grade={GRADE} text={TEXT} rubric={LESSON_LETTER_RUBRIC} />);
    expect(screen.queryByRole('button', { name: 'Copy into free writing' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Corrected version' }));
    expectNoViolations(await axe(container));
  });
});

describe('LetterTaskInput', () => {
  it('offers both tasks as a choice, shows the chosen one’s Leitpunkte, and counts words', () => {
    const onChange = vi.fn();
    renderWithIntl(<Input onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Choose a task' })).toBeInTheDocument();
    expect(screen.getByText('Absage')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Task B/ }));
    expect(screen.getByText('Erwartung')).toBeInTheDocument();
    expect(screen.queryByText('Absage')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ type: 'letter', taskIndex: 1, text: '' });

    const box = screen.getByRole('textbox', { name: 'Your letter' });
    expect(box).not.toHaveAttribute('spellcheck');
    fireEvent.change(box, { target: { value: 'Sehr geehrte Damen und Herren' } });
    expect(screen.getByText('5 / 40–60 words')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ type: 'letter', taskIndex: 1, text: 'Sehr geehrte Damen und Herren' });
    // The choice can change until submit, and keeps the text.
    fireEvent.click(screen.getByRole('radio', { name: /Task A/ }));
    expect(onChange).toHaveBeenLastCalledWith({ type: 'letter', taskIndex: 0, text: 'Sehr geehrte Damen und Herren' });
    expect(screen.getByText('5 / 30–50 words')).toBeInTheDocument();
  });

  it('turns spellcheck off when timed, with no axe violations', async () => {
    const { container } = renderWithIntl(<Input timed />);
    expect(screen.getByRole('textbox', { name: 'Your letter' })).toHaveAttribute('spellcheck', 'false');
    expectNoViolations(await axe(container));
  });

  it('shows a single task without a choice', () => {
    renderWithIntl(<LetterTaskInput content={{ tasks: [TWO_TASKS.tasks[0]] }} value={{ type: 'letter', taskIndex: 0, text: '' }} onChange={() => {}} timed={false} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('Aufgabe A: Ihre Freundin hat Sie eingeladen.')).toBeInTheDocument();
    expect(screen.getByText('Cover these points')).toBeInTheDocument();
  });
});
