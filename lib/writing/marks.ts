// Places each item's `original` in the text, in order: every search starts where the previous mark ended,
// so a repeated wrong phrase gets its marks on successive occurrences. Items that can't be found are dropped.
// Matching is done in Unicode NFC, so decomposed umlauts in the learner's text still match a model
// that echoes precomposed ones. The offsets are into `text.normalize('NFC')`: render that string.
export function locateMarks<T extends { original: string }>(text: string, items: T[]): (T & { start: number; end: number })[] {
  const out: (T & { start: number; end: number })[] = [];
  const haystack = text.normalize('NFC');
  let cursor = 0;
  for (const item of items) {
    if (typeof item.original !== 'string' || item.original.length === 0) continue;
    const needle = item.original.normalize('NFC');
    const start = haystack.indexOf(needle, cursor);
    if (start < 0) continue;
    const end = start + needle.length;
    out.push({ ...item, start, end });
    cursor = end;
  }
  return out;
}
