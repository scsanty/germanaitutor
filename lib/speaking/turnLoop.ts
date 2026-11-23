export type TurnState = 'student' | 'closing' | 'done';

// Where the conversation stands. The speaker of the last reply never matters: only the student's turn count,
// the Finish button and whether the examiner has already closed.
export function nextTurnState(input: { studentTurns: number; maxTurns: number; finished: boolean; closed: boolean }): TurnState {
  if (input.closed) return 'done';
  return input.finished || input.studentTurns >= input.maxTurns ? 'closing' : 'student';
}
