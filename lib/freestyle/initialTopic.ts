// S21: the ?topic= search param as a drill topic: a single string, trimmed, at most 200 characters; else undefined.
export function parseInitialTopic(topic: string | string[] | undefined): string | undefined {
  if (typeof topic !== 'string') return undefined;
  return topic.trim().slice(0, 200) || undefined;
}
