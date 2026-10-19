// S11: "Copy into free writing" leaves the letter here; Freestyle free writing takes it once, on mount.
export const WRITING_DRAFT_KEY = 'nadoch.writingDraft';

export function storeWritingDraft(text: string): void {
  try {
    sessionStorage.setItem(WRITING_DRAFT_KEY, text);
  } catch {
    // Storage can be blocked; free writing still opens, just without the draft.
  }
}

export function takeWritingDraft(): string | null {
  try {
    const draft = sessionStorage.getItem(WRITING_DRAFT_KEY);
    sessionStorage.removeItem(WRITING_DRAFT_KEY);
    return draft;
  } catch {
    return null;
  }
}
