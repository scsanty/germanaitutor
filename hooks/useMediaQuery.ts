'use client';

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false); // Matches the server render; the effect applies the real value.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return; // jsdom and very old browsers: keep the phone layout
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
