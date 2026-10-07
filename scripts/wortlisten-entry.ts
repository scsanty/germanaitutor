// Turns one printed Wortliste headword ("der Apfel, ¨-", "abgeben, gibt ab, hat abgegeben",
// "Abgase (Pl.)") into candidate entries. Used by extract-wortlisten.ts.

export interface Candidate {
  lemma: string;
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  plural: string | null;
  example: string;
  note?: string;
}

export interface Skipped { headword: string; reason: string }

const ARTICLES = /^((?:der|die|das)(?:\/(?:der|die|das))*) (?=[A-ZÄÖÜ0-9])/;
const REGION = /^(D|A|CH)(\s*,\s*(D|A|CH))*$/;

export function clean(s: string): string {
  return s.normalize('NFC').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

// Umlauts the last a/o/u of the stem; "au" becomes "äu" ("Haus" → "Häus-").
export function umlaut(word: string): string | null {
  const map: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' };
  for (let i = word.length - 1; i >= 0; i--) {
    const c = word[i];
    if (!(c in map)) continue;
    const prev = word[i - 1] ?? '';
    if ((c === 'u' || c === 'U') && /[aA]/.test(prev)) return word.slice(0, i - 1) + map[prev] + word.slice(i);
    if ((c === 'u' || c === 'U') && /[eEäÄ]/.test(prev)) continue; // "eu"/"äu" never take an umlaut
    return word.slice(0, i) + map[c] + word.slice(i + 1);
  }
  return null;
}

// Expands the list's plural shorthand: "-e", "¨-e", "-¨e", "-Ä, e", "ä, er", "-", "–", "-s/-e".
export function expandPlural(noun: string, notation: string): { plural: string | null; note?: string } {
  const n = notation.trim();
  if (!n) return { plural: null, note: 'no plural given' };
  const first = n.split('/')[0].trim();
  if (/^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(first)) return { plural: `die ${first.replace(/,$/, '')}` };
  if (/^die [A-ZÄÖÜ]/.test(first)) return { plural: first.replace(/,$/, '') };
  const needsUmlaut = /[¨äöüÄÖÜ]/.test(first);
  const suffix = first.replace(/[-–¨,.;\s]/g, '').replace(/[äöüÄÖÜ]/g, '');
  if (!/^[a-zß]{0,4}$/.test(suffix)) return { plural: null, note: `plural shorthand not understood: ${n}` };
  const stem = needsUmlaut ? umlaut(noun) : noun;
  if (!stem) return { plural: null, note: `plural shorthand not understood: ${n}` };
  const alts = n.split('/').length > 1 ? `; list gives ${n}` : '';
  return alts ? { plural: `die ${stem}${suffix}`, note: `plural alternatives${alts}` } : { plural: `die ${stem}${suffix}` };
}

// Removes "(sich)", "(Sg.)", "(von)", "(Bsp. …)" and similar, but not a bracket inside a word
// ("da(r)"); "(herunter-)fahren" becomes "herunterfahren".
export function stripParens(s: string): string {
  return clean(s.replace(/\(([a-zäöüß]+)-\)\s?(?=[a-zäöüß])/g, '$1').replace(/(^|\s+)\([^)]*\)/g, ' '));
}

// Splits on commas outside brackets: "wer (wen, wem)" stays one part.
function splitTop(s: string): string[] {
  const out = [''];
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) out.push('');
    else out[out.length - 1] += c;
  }
  return out.map((p) => p.trim());
}

function parens(s: string): string[] {
  return [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
}

export interface PosLists { verbs: Set<string>; adjectives: Set<string>; adverbs: Set<string>; notVerbs: Set<string> }

export function guessPos(lemma: string, hasVerbForms: boolean, lists: PosLists): Candidate['partOfSpeech'] {
  const w = lemma.toLowerCase();
  if (hasVerbForms || lists.verbs.has(w)) return 'verb';
  if (lists.adverbs.has(w)) return 'adverb';
  if (lists.adjectives.has(w)) return 'adjective';
  // "weh tun", "Rad fahren", "spazieren gehen", "an sein": the last word is the verb.
  const last = w.split(' ').pop()!;
  if (/\s/.test(w) && !/\//.test(w) && (lists.verbs.has(last) || ['sein', 'tun', 'haben'].includes(last))) return 'verb';
  if (/\s|\/|-$|^[A-ZÄÖÜ]/.test(lemma)) return 'other';
  if (/(ig|lich|isch|bar|los|sam|voll|haft|iv|ell|al|ent|ant|ös|är|weit|frei|reich|wert)$/.test(w) && w.length > 4) return 'adjective';
  // Participles used as adjectives: "verheiratet", "geschlossen".
  if (/^(ge|be|ver|er|zer)[a-zäöüß]{3,}t$/.test(w) || /^ge[a-zäöüß]{3,}en$/.test(w)) return 'adjective';
  if (/[a-zäöü](en|ern|eln)$/.test(w) && w.length > 4 && !lists.notVerbs.has(w)) return 'verb';
  return 'other';
}

// A spelling variant of the same noun, not a second noun: close in spelling, and not the "-in"
// feminine form ("die Disco" / "die Disko", not "der Kollege" / "die Kollegin").
export function variant(a: string, b: string): boolean {
  const x = a.replace(/^(der|die|das) /, '');
  const y = b.replace(/^(der|die|das) /, '');
  if (/in$/.test(y) && y.length > x.length) return false;
  return editDistance(x.toLowerCase(), y.toLowerCase()) <= 2;
}

export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// One headword may hold several entries ("der Chef, -s / die Chefin, -nen").
export function parseHeadword(raw: string, lists: PosLists): { entries: Candidate[]; skipped: Skipped[] } {
  let hw = clean(raw);
  const skipped: Skipped[] = [];
  // Everything after "→" is a cross-reference to another region's word.
  hw = clean(hw.split('→')[0]);
  const regions = parens(hw).filter((p) => REGION.test(p));
  if (regions.length && !regions.some((r) => /\bD\b/.test(r))) {
    return { entries: [], skipped: [{ headword: clean(raw), reason: `regional only (${regions.join('; ')})` }] };
  }
  hw = clean(hw.replace(/\((D|A|CH)(\s*,\s*(D|A|CH))*\)/g, ''));
  // "der Chef, -s / die Chefin, -nen" and "der Student, -en, die Studentin, -nen".
  // "das Datum, die Daten" is a plural, not a second noun: the second noun has its own shorthand.
  const parts = hw.split(/\s*\/\s*(?=(?:der|die|das) [A-ZÄÖÜ])|\s*,\s*(?=(?:der|die|das) [A-ZÄÖÜ][^,]*,)/);
  const entries: Candidate[] = [];
  parts.forEach((part, i) => {
    const e = parsePart(part, lists);
    if (!e) skipped.push({ headword: part, reason: 'empty after cleanup' });
    else if (i > 0 && entries[0]?.partOfSpeech === 'noun' && (e.partOfSpeech !== 'noun' || variant(entries[0].lemma, e.lemma))) {
      // "der Club, -s / Klub, -s", "die Disco, -s / die Disko, -s": one word, two spellings.
      entries[0].note = [entries[0].note, `also written ${part.replace(/,.*$/, '')}`].filter(Boolean).join('; ');
    } else entries.push(e);
  });
  return { entries, skipped };
}

function parsePart(part: string, lists: PosLists): Candidate | null {
  const flags = parens(part);
  const plOnly = flags.some((f) => /^pl\.?$/i.test(f));
  const sgOnly = flags.some((f) => /^Sg\.?$/.test(f));
  const art = part.match(ARTICLES);
  if (art || (plOnly && /^[A-ZÄÖÜ]/.test(part))) {
    const articles = art ? art[1].split('/') : ['die'];
    const rest = art ? part.slice(art[0].length) : part;
    // "die Nord-/Ostsee" stays whole; "die Disco/Disko" keeps its first spelling.
    let word = stripParens(rest.split(',')[0]).replace(/^([^/]*[^-/])\/.*$/, '$1');
    const notation = rest.includes(',') ? stripParens(rest.slice(rest.indexOf(',') + 1)) : '';
    const notes: string[] = [];
    if (articles.length > 1) notes.push(`also ${articles.slice(1).join('/')} ${word}`);
    // A source slip: "die Kursleiter, -nen" for "die Kursleiterin, -nen".
    if (articles[0] === 'die' && /^-nen$/.test(notation) && !/in$/.test(word)) {
      word = `${word}in`;
      notes.push('source prints the masculine form; feminine -in added');
    }
    let plural: string | null = null;
    if (plOnly) notes.push('plural only');
    else if (sgOnly) notes.push('singular only');
    else {
      const p = expandPlural(word, notation);
      plural = p.plural;
      if (p.note) notes.push(p.note);
    }
    return { lemma: `${articles[0]} ${word}`, partOfSpeech: 'noun', plural, example: '', ...(notes.length ? { note: notes.join('; ') } : {}) };
  }
  // A noun printed without its article ("Ratschlag, ¨-e", "S-Bahn, -en"); the caller looks it up.
  const bare = part.match(/^([A-ZÄÖÜ][\wäöüßÄÖÜ-]*),\s*([-–¨][^,(]*)/);
  if (bare) {
    const p = expandPlural(bare[1], bare[2]);
    return { lemma: bare[1], partOfSpeech: 'noun', plural: p.plural, example: '', note: ['article missing in source', p.note].filter(Boolean).join('; ') };
  }
  const commaParts = splitTop(part);
  // "(an-)/(aus)ziehen": keep the last alternative; "(ab)fahren" lists as "fahren".
  let lemma = stripParens(commaParts[0].replace(/^\([^)]*\)\/(?=\()/, '').replace(/^\([a-zäöüß]+\)(?=[a-zäöüß])/, ''));
  if (!lemma) return null;
  // "(sich) anmelden" and "sich beeilen" both list as "anmelden"/"beeilen"; idioms keep "sich".
  const reflexive = /^\(?sich\)? /.test(commaParts[0]) || /\(sich\)/.test(commaParts[0]);
  if (reflexive) lemma = lemma.replace(/^sich /, '');
  if (reflexive && /\s/.test(lemma)) lemma = `sich ${lemma}`;
  // A missing comma in the source: "festnehmen nimmt fest, nahm fest, …".
  const words = lemma.split(' ');
  if (/\b(hat|ist)\b/.test(part) && words.length > 2 && !/(en|ern|eln|n)$/.test(lemma)) {
    const inf = words.findIndex((w) => /^[a-zäöüß]+(en|ern|eln)$/.test(w));
    if (inf >= 0) lemma = words.slice(0, inf + 1).join(' ');
  }
  const hasVerbForms = commaParts.length > 1 && /(en|ern|eln|n)$/.test(lemma) && /\b(hat|ist)\b/.test(part);
  const note = reflexive && !lemma.startsWith('sich ') ? { note: `reflexive: sich ${lemma}` } : {};
  return { lemma, partOfSpeech: guessPos(lemma, hasVerbForms, lists), plural: null, example: '', ...note };
}
