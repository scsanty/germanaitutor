import type { ReactNode } from 'react';
import { Check, CircleAlert, X, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { GradeResult } from '@/lib/tutoring/grading';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'success' | 'danger' | 'highlight';

const DISC: Record<Tone, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  highlight: 'bg-highlight/15 text-highlight',
};

// The end of a run (queue, practice batch, test-out, placement): one centred card with an icon
// disc, the score as the loudest thing on the screen, then the way onward.
export function ResultCard({
  icon: Icon,
  tone = 'primary',
  className,
  children,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        'mx-auto w-full max-w-md animate-rise-in items-center gap-4 px-5 py-8 text-center sm:px-8 motion-reduce:animate-none',
        className,
      )}
    >
      {Icon && (
        <span aria-hidden className={cn('flex size-16 items-center justify-center rounded-full', DISC[tone])}>
          <Icon className="size-8" strokeWidth={2.5} />
        </span>
      )}
      {children}
    </Card>
  );
}

// The score in large Nunito. Tabular figures so "1.5 of 2" does not jitter between results.
export const SCORE = 'font-heading text-5xl leading-none font-extrabold tracking-tight tabular-nums sm:text-6xl';

// The buttons that lead on: full width in the card, at least 48 px high; a long lesson title wraps.
export const ONWARD = 'h-auto min-h-12 w-full py-3 text-base font-semibold whitespace-normal';

const REVIEW_BADGE: Record<GradeResult, { icon: LucideIcon; className: string }> = {
  correct: { icon: Check, className: 'border-success/50 bg-success/10 text-success' },
  almost: { icon: CircleAlert, className: 'border-warning/50 bg-warning/10 text-warning' },
  wrong: { icon: X, className: 'border-danger/50 bg-danger/10 text-danger' },
};

// Right / Almost / Wrong on a review item: icon plus colour, so it reads without colour too.
export function ReviewBadge({ result, children }: { result: GradeResult; children: ReactNode }) {
  const { icon: Icon, className } = REVIEW_BADGE[result];
  return (
    <Badge variant="outline" className={cn('h-7 px-2.5 text-sm', className)}>
      <Icon aria-hidden />
      {children}
    </Badge>
  );
}
