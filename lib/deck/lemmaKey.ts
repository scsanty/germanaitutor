// Spec: duplicate detection by the normalized lemma, article included ("der See" ≠ "die See").
// NFC first, so a decomposed "für" (from a PDF) keys the same as a composed one.
export function lemmaKey(lemma: string): string {
  return lemma.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}
