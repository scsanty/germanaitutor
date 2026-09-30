// Shared class strings for the admin pages, all token-backed (see app/theme.css).
export const FOCUS = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

// A standalone link: primary colour, 44 px tall.
export const LINK = `inline-flex min-h-11 items-center gap-1.5 rounded-sm text-primary underline-offset-4 hover:underline ${FOCUS}`;

// A table inside a container that scrolls sideways on its own, so the page never does.
export const TABLE_WRAP = 'max-h-[70vh] overflow-auto rounded-lg border bg-card';
export const TABLE = 'w-full border-collapse text-left text-sm';
export const TH = 'sticky top-0 z-10 border-b bg-surface-raised px-3 py-2.5 font-semibold whitespace-nowrap';
export const TD = 'border-b px-3 py-2 align-middle last:border-b-0';

export const FIELD_LABEL = 'flex flex-col gap-1.5 text-sm font-medium';
export const HINT = 'text-sm text-text-muted';

// shadcn controls default to 36 px; admin overrides them to the 44 px tap target.
export const INPUT = 'h-11';
export const BTN = 'h-11 px-4';
export const PAGE_TITLE = 'mb-2 text-2xl font-bold';
