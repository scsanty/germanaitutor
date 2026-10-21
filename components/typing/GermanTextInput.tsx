'use client';

import { useRef, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { mergeRefs } from './mergeRefs';
import { UmlautControls } from './UmlautRow';

type Props = ComponentProps<typeof Input> & { wrapperClassName?: string };

// An Input with the "äöü" toggle and letter row beneath it.
export function GermanTextInput({ ref, wrapperClassName, ...props }: Props) {
  const inner = useRef<HTMLInputElement | null>(null);
  return (
    <div className={cn('flex flex-col gap-2', wrapperClassName)}>
      <Input ref={mergeRefs(ref, inner)} {...props} />
      <UmlautControls target={() => inner.current} disabled={props.disabled || props.readOnly} />
    </div>
  );
}
