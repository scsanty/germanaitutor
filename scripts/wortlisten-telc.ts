// telc A1–B1 Wortschatzlisten: two columns of "Wort   L6" (word plus coursebook lesson), no
// articles, plurals or examples. Nouns take their article (and plural) from the Goethe lists,
// directly or through the last part of a compound; the rest are left for the meaning step.
import type { Row } from './wortlisten-pdf';
import { clean, expandPlural, guessPos, type Candidate, type PosLists } from './wortlisten-entry';
import { EXTRA_NOUNS, SUFFIX_ARTICLES } from './wortlisten-pos';

export interface NounInfo { article: string; plural: string | null }

// Rows → printed headwords. A headword ends on the row that carries its lesson tag; a long one
// wraps ("AGB (=Allgemeine" / "Geschäftsbedingungen)   L4").
export function groupTelc(rows: Row[]): { headword: string; page: number }[] {
  const out: { headword: string; page: number }[] = [];
  let buf = '';
  for (const row of rows) {
    const hw = row.hw.trim();
    const tag = /^L\d+$/.test(row.ex.trim());
    if (hw && !/^[A-ZÄÖÜ]$/.test(hw)) buf = buf ? (buf.endsWith('/') ? buf + hw : `${buf} ${hw}`) : hw;
    if (tag && buf) { out.push({ headword: clean(buf), page: row.page }); buf = ''; }
  }
  if (buf) out.push({ headword: clean(buf), page: rows[rows.length - 1]?.page ?? 0 });
  return out;
}

const NOT_NOUNS = new Set(['Ihr', 'Ihre', 'Ihnen', 'Sie', 'Ihr/Ihre']);

export function lookupNoun(word: string, nouns: Map<string, NounInfo>, compounds = true): { info: NounInfo; note?: string; plural: string | null } | null {
  const direct = nouns.get(word);
  if (direct) return { info: direct, plural: direct.plural, note: 'article taken from the Goethe lists' };
  if (!compounds) return null;
  const dash = word.lastIndexOf('-');
  if (dash > 0 && nouns.has(word.slice(dash + 1))) {
    const info = nouns.get(word.slice(dash + 1))!;
    const plural = info.plural ? `die ${word.slice(0, dash + 1)}${info.plural.slice(4)}` : null;
    return { info, plural, note: `article inferred from ${info.article} ${word.slice(dash + 1)}` };
  }
  // A compound takes the article of its last part: "Apfelsaft" → "der Saft".
  for (let i = 3; i <= word.length - 3; i++) {
    const head = word[i].toUpperCase() + word.slice(i + 1);
    const info = nouns.get(head);
    if (!info) continue;
    const prefix = word.slice(0, i);
    const plural = info.plural ? `die ${prefix}${info.plural.slice(4)[0].toLowerCase()}${info.plural.slice(5)}` : null;
    return { info, plural, note: `article inferred from ${info.article} ${head}` };
  }
  return null;
}

const EXTRA = new Map<string, NounInfo>(EXTRA_NOUNS.map((line) => {
  const [article, word, notation = ''] = line.split(' ');
  return [word, { article, plural: notation ? expandPlural(word, notation).plural : null }];
}));

// Articles fixed by the ending ("-ung" → die) or, for "-in", by a masculine form in the lists.
function bySuffix(word: string, known: (w: string) => boolean): { info: NounInfo; plural: string | null; note: string } | null {
  if (/in$/.test(word) && word.length > 4) {
    const base = word.slice(0, -2);
    const plain = base.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
    if (known(base) || known(plain) || known(`${base}e`) || known(`${plain}e`)) {
      return { info: { article: 'die', plural: `die ${word}nen` }, plural: `die ${word}nen`, note: 'article from the feminine ending -in' };
    }
  }
  for (const r of SUFFIX_ARTICLES) {
    if (!r.re.test(word)) continue;
    const plural = r.plural === undefined ? null : `die ${word}${r.plural}`;
    return { info: { article: r.article, plural }, plural, note: `article from the ending ${word.match(r.re)![0].replace(/^[^a-zäöüß]*/, '')}` };
  }
  return null;
}

function telcNoun(word: string, nouns: Map<string, NounInfo>, known: (w: string) => boolean): Candidate {
  const extra = EXTRA.get(word);
  const hit = lookupNoun(word, nouns, false)
    ?? (extra ? { info: extra, plural: extra.plural } : null)
    ?? bySuffix(word, known)
    ?? lookupNoun(word, nouns);
  if (hit?.note === 'article taken from the Goethe lists') hit.note = undefined;
  if (!hit) return { lemma: word, partOfSpeech: 'noun', plural: null, example: '', note: 'article unknown (telc lists print none)' };
  const notes = [hit.note, hit.plural ? undefined : 'no plural given'].filter(Boolean) as string[];
  return {
    lemma: `${hit.info.article} ${word}`, partOfSpeech: 'noun', plural: hit.plural, example: '',
    ...(notes.length ? { note: notes.join('; ') } : {}),
  };
}

export function parseTelc(headword: string, nouns: Map<string, NounInfo>, lists: PosLists, known: (w: string) => boolean): Candidate[] {
  let hw = headword;
  // "besten (am besten)" → "am besten"; "Abitur (Abi)" and "AGB (=…)" keep the main form.
  const am = hw.match(/\((am \S+)\)/);
  if (am) return [{ lemma: am[1], partOfSpeech: 'adverb', plural: null, example: '' }];
  hw = clean(hw.replace(/\s*\([^)]*\)/g, ''));
  if (/^[a-zäöüß]/.test(hw) || NOT_NOUNS.has(hw)) {
    const lemma = hw.includes('/') ? hw : hw.split(',')[0].trim();
    return [{ lemma, partOfSpeech: guessPos(lemma, false, lists), plural: null, example: '' }];
  }
  const parts = hw.split('/').map((p) => p.trim()).filter(Boolean);
  const words: string[] = [parts[0]];
  const variants: string[] = [];
  for (const p of parts.slice(1)) {
    if (p === 'in') words.push(`${parts[0]}in`); // "Lehrer/in"
    else if (/in$/.test(p) && p.length > parts[0].length) words.push(p); // "Arzt/Ärztin"
    else if (similar(parts[0], p)) variants.push(p); // "Ellbogen/Ellenbogen"
    else words.push(p); // "Hausmann/Hausfrau"
  }
  return words.map((w, i) => {
    const c = telcNoun(w, nouns, known);
    if (i === 0 && variants.length) c.note = [c.note, `also written ${variants.join(', ')}`].filter(Boolean).join('; ');
    return c;
  });
}

function similar(a: string, b: string): boolean {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length] <= 2;
}
