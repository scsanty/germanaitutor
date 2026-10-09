'use client';

import { useEffect, useState } from 'react';

function read(endsAt: number): { secondsLeft: number; overtime: boolean } {
  const ms = endsAt - Date.now();
  return { secondsLeft: Math.max(0, Math.ceil(ms / 1000)), overtime: ms <= 0 };
}

// Counts down from the server's `startedAt`, so a reload continues the real clock. Overtime never
// stops the attempt: the clock sits at zero and `overtime` turns true.
export function useCountdown(startedAt: string, minutes: number): { secondsLeft: number; overtime: boolean } {
  const endsAt = Date.parse(startedAt) + minutes * 60_000;
  const [state, setState] = useState(() => read(endsAt));

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const next = read(endsAt);
        return next.secondsLeft === prev.secondsLeft && next.overtime === prev.overtime ? prev : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return state;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
