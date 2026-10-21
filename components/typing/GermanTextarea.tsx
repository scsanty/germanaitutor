'use client';

import { useRef, type ComponentProps } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { mergeRefs } from './mergeRefs';
import { UmlautControls } from './UmlautRow';

type Props = ComponentProps<typeof Textarea> & { wrapperClassName?: string };

// A Textarea with the "äöü" toggle and letter row beneath it.
export function GermanTextarea({ ref, wrapperClassName, ...props }: Props) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div className={cn('flex flex-col gap-2', wrapperClassName)}>
      <Textarea ref={mergeRefs(ref, inner)} {...props} />
      <UmlautControls target={() => inner.current} disabled={props.disabled || props.readOnly} />
    </div>
  );
}
