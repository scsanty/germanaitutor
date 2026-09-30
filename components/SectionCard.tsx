import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// One group on Profile and Settings: a Card whose title stays a real h2 for the page outline.
export function SectionCard({
  title,
  className,
  children,
}: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('min-w-0 gap-4', className)}>
      <CardHeader>
        <h2 className="text-lg leading-tight">{title}</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

// The grid the cards sit in: one column on phones, two from md.
export const CARD_GRID = 'grid items-start gap-4 md:grid-cols-2';
