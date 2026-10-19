// Places each item's `original` in the text, in order: every search starts where the previous mark ended,
// so a repeated wrong phrase gets its marks on successive occurrences. Items that can't be found are dropped.
export function locateMarks<T extends { original: string }>(text: string, items: T[]): (T & { start: number; end: number })[] {
  const out: (T & { start: number; end: number })[] = [];
  let cursor = 0;
  for (const item of items) {
    if (typeof item.original !== 'string' || item.original.length === 0) continue;
    const start = text.indexOf(item.original, cursor);
    if (start < 0) continue;
    const end = start + item.original.length;
    out.push({ ...item, start, end });
    cursor = end;
  }
  return out;
}
