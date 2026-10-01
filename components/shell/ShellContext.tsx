'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

const ShellContext = createContext<{ focus: boolean; setFocus: (focus: boolean) => void }>({ focus: false, setFocus: () => {} });

export function ShellProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState(false);
  return <ShellContext.Provider value={{ focus, setFocus }}>{children}</ShellContext.Provider>;
}

// Focus mode (exercise runs) hides the shell; FocusLayout turns it on and off.
export function useShell() {
  return useContext(ShellContext);
}
