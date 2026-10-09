'use client';

import { useEffect, useState } from 'react';

function read(startsAt: number, endsAt: number, offsetMs: number): { secondsLeft: number; overtime: boolean } {
  // Elapsed time is never negative, so a client clock behind the server can't add time.
  const now = Math.max(startsAt, Date.now() + offsetMs);
  const ms = endsAt - now;
  return { secondsLeft: Math.max(0, Math.ceil(ms / 1000)), overtime: ms <= 0 };
}

// Counts down from the server's `startedAt`, so a reload continues the real clock. Overtime never
// stops the attempt: the clock sits at zero and `overtime` turns true. `offsetMs` (server minus client
// clock, measured when the run arrived) keeps a skewed device clock from showing the wrong time.
export function useCountdown(startedAt: string, minutes: number, offsetMs = 0): { secondsLeft: number; overtime: boolean } {
  const startsAt = Date.parse(startedAt);
  const endsAt = startsAt + minutes * 60_000;
  const [state, setState] = useState(() => read(startsAt, endsAt, offsetMs));

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const next = read(startsAt, endsAt, offsetMs);
        return next.secondsLeft === prev.secondsLeft && next.overtime === prev.overtime ? prev : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [startsAt, endsAt, offsetMs]);

  return state;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
