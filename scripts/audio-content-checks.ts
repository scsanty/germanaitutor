// Content checks for audio_questions drafts, shared by merge-teil-sets.ts and merge-lesson-exercises.ts
// (preflight section 4, "T9-pre"). These run on top of the real validators (validateTask /
// validateExerciseContent), so they never repeat a problem those already report.
//
// errors   block the merge.
// warnings are printed for the reviewer to decide (TTS hazards, possible giveaways, ordering, English words).
import { audioHash, parseTranscript, type ParsedTranscript } from '../lib/audio/transcript';
import type { ExamPart } from '../lib/exam/formats';

export interface AudioCheckResult {
  errors: string[];
  warnings: string[];
}

interface Question {
  question?: unknown;
  options?: unknown;
  evidence?: unknown;
}

// A marker line separates the texts of a multi-text part: "[Ansage f] Text 2."
export const MARKER_TEXT = /^Text (\d+)\.$/;

const NUMBER_WORDS: Record<string, number> = {
  zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
};
const COUNT = '(\\d+|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)';
const MULTI_TEXT = [
  new RegExp(`\\b${COUNT}\\s+(?:kurze\\s+)?(?:Texte|Gespräche|Durchsagen|Ansagen|Informationen)\\b`, 'i'),
  new RegExp(`\\bMeinungen von ${COUNT} Personen\\b`, 'i'),
];

export type OptionRule = 'richtig-falsch' | 'abc' | 'richtig-falsch-then-abc' | 'ja-nein' | null;

// What option shape the part's (German) instructions call for.
export function optionRule(part: Pick<ExamPart, 'instructions'>): OptionRule {
  const text = part.instructions;
  const rf = /richtig oder falsch/i.test(text);
  const abc = /a, b oder c/.test(text);
  if (rf && abc) return 'richtig-falsch-then-abc'; // Goethe B1/B2 Teil 1: per text one R/F, then one a/b/c
  if (rf) return 'richtig-falsch';
  if (abc) return 'abc';
  if (/\bJa oder Nein\b/i.test(text)) return 'ja-nein';
  return null;
}

// How many texts a multi-text part has ("fünf kurze Texte", "vier Durchsagen", "5 kurze Texte"), or null.
export function textCount(part: Pick<ExamPart, 'instructions'>): number | null {
  for (const re of MULTI_TEXT) {
    const m = re.exec(part.instructions);
    if (m) {
      const word = m[1].toLowerCase();
      return NUMBER_WORDS[word] ?? Number(word);
    }
  }
  return null;
}

// Piper reads these badly; the reviewer decides. Marker lines ("Text 2.") are exempt.
const TTS_HAZARDS: { name: string; re: RegExp }[] = [
  { name: 'clock time', re: /\b\d{1,2}[:.]\d{2}\b/g },
  { name: 'currency sign', re: /[€$£]|\bEUR\b/g },
  { name: 'percent sign', re: /%/g },
  { name: 'abbreviation', re: /(?<![\p{L}])(?:z\. ?B\.|d\. ?h\.|u\. ?a\.|Nr\.|\p{L}*[sS]tr\.|ca\.|usw\.|bzw\.|evtl\.|inkl\.|Tel\.|Dr\.)/gu },
  { name: 'digits', re: /\d+(?:[.,]\d+)*/g },
  { name: 'all-caps abbreviation', re: /(?<![\p{L}])[A-ZÄÖÜ]{2,}(?![\p{L}])/gu },
];

export function ttsHazards(text: string): string[] {
  const found: string[] = [];
  for (const { name, re } of TTS_HAZARDS) {
    // Digits inside a clock time are already reported as the time.
    const scope = name === 'digits' ? text.replace(TTS_HAZARDS[0].re, ' ') : text;
    const hits = [...new Set(scope.match(re) ?? [])];
    if (hits.length > 0) found.push(`${name} ${hits.map((h) => `"${h}"`).join(', ')}`);
  }
  return found;
}

// A crude German-only check: common English function words (whole words, any case).
const ENGLISH = new Set([
  'the', 'and', 'is', 'are', 'you', 'your', 'what', 'which', 'with', 'this', 'that', 'does', 'where', 'when',
  'they', 'of', 'for', 'from', 'have', 'has', 'there', 'would', 'should', 'please',
]);
export function englishWords(text: string): string[] {
  return [...new Set((text.match(/[\p{L}']+/gu) ?? []).map((w) => w.toLowerCase()).filter((w) => ENGLISH.has(w)))];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function transcriptHashOf(content: unknown): string | null {
  const t = (content as { transcript?: unknown })?.transcript;
  if (typeof t !== 'string') return null;
  const parsed = parseTranscript(t);
  return 'error' in parsed ? null : audioHash(parsed);
}

export interface AudioCheckOptions {
  // The exam part, for Teil sets. Lessons have none, so the format checks are skipped.
  part?: Pick<ExamPart, 'instructions' | 'items'>;
  // Exam content is German-only, so the questions and options are checked too. The transcript always is.
  germanOnlyQuestions?: boolean;
}

export function audioContentProblems(content: unknown, opts: AudioCheckOptions = {}): AudioCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const c = (content ?? {}) as { transcript?: unknown; questions?: unknown };
  const questions: Question[] = Array.isArray(c.questions) ? (c.questions as Question[]) : [];

  // Evidence is required on every question (the validator treats it as optional).
  questions.forEach((q, i) => {
    if (typeof q?.evidence !== 'string' || q.evidence.trim().length === 0) errors.push(`question ${i + 1}: evidence is required`);
  });

  // Option shape from the part's instructions.
  const rule = opts.part ? optionRule(opts.part) : null;
  questions.forEach((q, i) => {
    const options = Array.isArray(q?.options) ? (q.options as unknown[]) : null;
    if (!options || !rule) return;
    const isRF = options.length === 2 && options[0] === 'Richtig' && options[1] === 'Falsch';
    const isABC = options.length === 3 && new Set(options.map((o) => (typeof o === 'string' ? o.trim() : o))).size === 3;
    const n = `question ${i + 1}`;
    if (rule === 'richtig-falsch' && !isRF) errors.push(`${n}: this part is Richtig/Falsch; options must be exactly ["Richtig","Falsch"]`);
    if (rule === 'abc' && !isABC) errors.push(`${n}: this part is a, b oder c; it needs exactly 3 distinct options`);
    if (rule === 'ja-nein' && !(options.length === 2 && options[0] === 'Ja' && options[1] === 'Nein')) {
      errors.push(`${n}: this part is Ja/Nein; options must be exactly ["Ja","Nein"]`);
    }
    if (rule === 'richtig-falsch-then-abc') {
      if (i % 2 === 0 && !isRF) errors.push(`${n}: this part alternates Richtig/Falsch then a, b oder c; options must be exactly ["Richtig","Falsch"]`);
      if (i % 2 === 1 && !isABC) errors.push(`${n}: this part alternates Richtig/Falsch then a, b oder c; it needs exactly 3 distinct options`);
    }
  });

  if (typeof c.transcript !== 'string') return { errors, warnings };
  const parsed = parseTranscript(c.transcript);
  // The validator already reports an unparseable transcript; the line checks need a parsed one (S5).
  if ('error' in parsed) return { errors, warnings };
  const lines = parsed.lines;
  const isMarker = (l: ParsedTranscript['lines'][number]) => MARKER_TEXT.test(l.text);

  // Evidence must sit inside exactly one line, so the reveal highlights one place.
  const evidenceLine: (number | null)[] = questions.map((q, i) => {
    if (typeof q?.evidence !== 'string' || q.evidence.trim().length === 0) return null;
    const ev = q.evidence;
    const hits = lines.flatMap((l, idx) => (l.text.includes(ev) ? [idx] : []));
    if (hits.length > 1) errors.push(`question ${i + 1}: evidence appears in ${hits.length} transcript lines (${hits.map((h) => h + 1).join(', ')}); it must match exactly one`);
    if (typeof q.question === 'string' && normalize(q.question) === normalize(ev)) {
      warnings.push(`question ${i + 1}: the question repeats the evidence word for word, which gives the answer away`);
    }
    return hits.length === 1 ? hits[0] : null;
  });

  // Multi-text parts: one marker line per text, numbered in order, and questions in text order.
  const texts = opts.part ? textCount(opts.part) : null;
  const markers = lines.flatMap((l, idx) => (isMarker(l) ? [{ idx, n: Number(MARKER_TEXT.exec(l.text)![1]) }] : []));
  if (texts !== null) {
    if (markers.length !== texts) {
      errors.push(`this part has ${texts} texts; the transcript needs ${texts} marker lines like "[Ansage f] Text 1.", found ${markers.length}`);
    } else if (markers.some((m, k) => m.n !== k + 1)) {
      errors.push(`marker lines must be numbered Text 1. to Text ${texts}. in order`);
    } else {
      const known = evidenceLine.filter((l): l is number => l !== null);
      if (known.some((l, k) => k > 0 && l < known[k - 1])) warnings.push('questions are not in text order (evidence lines go backwards)');
      const textOf = (line: number) => markers.filter((m) => m.idx < line).length; // 0 = before Text 1.
      if (known.some((l) => textOf(l) === 0)) errors.push('evidence sits before the first marker line');
      if (questions.length >= texts) {
        const covered = new Set(known.map(textOf));
        const missing = markers.map((_, k) => k + 1).filter((k) => !covered.has(k));
        if (missing.length > 0) warnings.push(`no question has evidence in text ${missing.join(', ')}`);
      }
    }
  }

  // Speakers: the voice pool has 3 voices per gender. A marker speaker takes one of them (I9).
  const speakers = { m: new Set<string>(), f: new Set<string>() };
  const markerSpeakers = new Set(lines.filter(isMarker).map((l) => `${l.label}|${l.gender}`));
  for (const l of lines) speakers[l.gender].add(`${l.label}|${l.gender}`);
  for (const g of ['m', 'f'] as const) {
    const label = g === 'm' ? 'male' : 'female';
    if (speakers[g].size > 3) errors.push(`${speakers[g].size} ${label} speakers; at most 3 (voices would repeat)`);
    else if (markerSpeakers.size > 0) {
      const others = [...speakers[g]].filter((s) => !markerSpeakers.has(s)).length;
      if (others > 2) warnings.push(`${others} ${label} speakers besides the marker speaker; keep at most 2 so voices don't repeat`);
    }
  }
  if (markerSpeakers.size > 1) warnings.push(`use one marker speaker per transcript, found ${markerSpeakers.size}`);

  // TTS hazards and English words in what is spoken.
  lines.forEach((l, idx) => {
    if (isMarker(l)) return;
    for (const h of ttsHazards(l.text)) warnings.push(`transcript line ${idx + 1}: TTS hazard, ${h}; write it as spoken`);
    const en = englishWords(l.text);
    if (en.length > 0) warnings.push(`transcript line ${idx + 1}: English word(s) ${en.join(', ')}; the transcript is German-only`);
  });
  if (opts.germanOnlyQuestions) {
    questions.forEach((q, i) => {
      const text = [q?.question, ...(Array.isArray(q?.options) ? q.options : [])].filter((s) => typeof s === 'string').join(' ');
      const en = englishWords(text);
      if (en.length > 0) warnings.push(`question ${i + 1}: English word(s) ${en.join(', ')}; exam content is German-only`);
    });
  }

  return { errors, warnings };
}

// B2: an exercise that still prints spoken text (under any label) is printed audio and must be converted.
// The label regex is the B2 ruling's. The hint regex is narrowed to "(spoken: …)": the ruling's "(number …)"
// also hits two strategy questions that must stay ("… genau ___ Mal. (number: zwei)").
export const PRINTED_AUDIO: RegExp[] = [
  /(Hörtext|Ansage|Durchsage|Nachricht|Radiomeldung|Wetterbericht|Gespräch|Interview|Telefonnachricht|Anrufbeantworter|Verkäufer\w*|Kunde|Frau|Mann|Gast)\s*(\([^)]*\))?\s*:\s*['"„‚]/,
  /\(spoken[^)]*\)/,
];
// Labels the ruling's regex misses but that usually introduce a quoted utterance; a warning for the reviewer.
export const MAYBE_PRINTED_AUDIO =
  /(Sprecher\w*|Moderator\w*|Führung|Radio|Podcast|Dialog|Audio|Debatte|Diskussion|Vortrag\w*|Vortragende\w*|Dozent\w*|Expert\w*|Forscher\w*|Befragte\w*|Hörsituation|Interview\w*|\bsagt|äußert)\s*(\([^)]*\))?\s*:\s*(?:[^'"„‚:]{1,40}:\s*)?['"„‚]/;

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

export function printsAudio(content: unknown): boolean {
  return strings(content).some((s) => PRINTED_AUDIO.some((re) => re.test(s)));
}

export function maybePrintsAudio(content: unknown): boolean {
  return strings(content).some((s) => MAYBE_PRINTED_AUDIO.test(s));
}
