import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// shadcn's NativeSelect: a real <select> dressed like the Select trigger. Used for the
// student-facing pickers so phones get their native picker and the value stays a plain
// form value (fireEvent.change in tests, autofill, no portal).
function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative w-full has-[select:disabled]:opacity-50", wrapperClassName)}
    >
      <select
        data-slot="native-select"
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-2 pr-10 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 md:text-sm [&>option]:bg-popover [&>option]:text-popover-foreground",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
