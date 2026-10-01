'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useShell } from '@/components/shell/ShellContext';
import { useExerciseShortcuts } from './useExerciseShortcuts';

// Spec: Focus mode. Hides the shell; ✕ + progress at the top; content with its Check/Next at the bottom.
export function FocusLayout({
  progress,
  confirmExit,
  onExit,
  children,
}: {
  progress: { current: number; total: number } | null;
  confirmExit: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('focus');
  const { setFocus } = useShell();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setFocus(true);
    return () => setFocus(false);
  }, [setFocus]);

  function requestExit() {
    if (confirmExit) setAsking(true);
    else onExit();
  }

  // Esc while the dialog is open belongs to the dialog (it closes it).
  useExerciseShortcuts({ onEscape: asking ? undefined : requestExit });

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background py-3">
        <Button variant="ghost" size="icon" aria-label={t('leave')} onClick={requestExit}>
          <X aria-hidden />
        </Button>
        {progress && (
          <Progress
            className="flex-1"
            value={(progress.current / progress.total) * 100}
            aria-label={t('progress', { current: progress.current, total: progress.total })}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col pb-6">{children}</div>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle>{' '}
          <AlertDialogDescription>{t('leaveBody')}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('stay')}</AlertDialogCancel>
            <AlertDialogAction onClick={onExit}>{t('leaveAnyway')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
