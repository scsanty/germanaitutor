'use client';

import { useEffect } from 'react';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  // Radios and checkboxes take no typed text, so the shortcuts still work once one is chosen.
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'radio' && type !== 'checkbox';
  }
  return ['TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

// Enter on a focused button or link already activates it; a shortcut on top would fire twice.
// A radio drawn as a button (RadioGroup) is not: Enter there still checks, as on a native radio.
function isActivatable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || el.getAttribute('role') === 'radio') return false;
  return el.tagName === 'BUTTON' || el.tagName === 'A';
}

// Spec: Focus mode shortcuts. 1–4 pick an option, Enter checks/continues, Esc exits.
// Ignored while typing, so answers can contain digits and Enter submits the form normally.
export function useExerciseShortcuts(handlers: { onPick?: (index: number) => void; onEnter?: () => void; onEscape?: () => void }): void {
  const { onPick, onEnter, onEscape } = handlers;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Esc from a text field must not leave the run: the unsent draft would be lost.
      if (isTyping(event.target)) return;
      // An open dialog (exit confirmation, the lesson chat sheet) owns the keys, Esc included.
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }
      // A held key must not check and then continue.
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[1-4]$/.test(event.key) && onPick) {
        event.preventDefault();
        onPick(Number(event.key) - 1);
      } else if (event.key === 'Enter' && onEnter && !isActivatable(event.target)) {
        event.preventDefault();
        onEnter();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onPick, onEnter, onEscape]);
}
