// Spec: Error Log snippets. Each is at most `max` characters, cut at a word boundary.
export function trimSnippet(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const space = head.lastIndexOf(' ');
  const cut = space > 0 ? head.slice(0, space) : head;
  return `${cut.trimEnd()}…`;
}
