// Spec: duplicate detection by the normalized lemma, article included ("der See" ≠ "die See").
// NFC first, so a decomposed "für" (from a PDF) keys the same as a composed one.
export function lemmaKey(lemma: string): string {
  return lemma.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

const ARTICLE = /^(der|die|das) \S/;

// A noun lemma carries its article ("der Hund", never "Hund"). Shared by the word-list check and
// the AI normalize reply (M6).
export function nounHasArticle(lemma: string): boolean {
  return ARTICLE.test(lemma);
}
