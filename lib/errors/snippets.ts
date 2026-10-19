// Spec: Error Log snippets. Each is at most `max` characters (the ellipsis counts), cut at a word boundary.
export function trimSnippet(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const room = max - 1; // leave space for the ellipsis
  const head = t.slice(0, room + 1);
  const space = head.lastIndexOf(' ');
  const cut = space > 0 ? head.slice(0, space) : t.slice(0, room);
  return `${cut.trimEnd()}…`;
}
