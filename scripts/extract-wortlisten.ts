// One-off: extracts the official Goethe and telc A1–B1 Wortlisten from their PDFs into candidate
// files (no meanings yet). PDFs and output stay in the gitignored .superpowers folder.
// Run: npx tsx scripts/extract-wortlisten.ts [--sample 20] [--seed 1]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lemmaKey } from '../lib/deck/lemmaKey';
import { readPages, pageRows, type ColumnSpec, type Page, type Row, type Word } from './wortlisten-pdf';
import { groupGoethe, firstExample, type RawEntry } from './wortlisten-goethe';
import { parseHeadword, type Candidate, type PosLists, type Skipped } from './wortlisten-entry';
import { groupTelc, lookupNoun, parseTelc, type NounInfo } from './wortlisten-telc';
import { ADJECTIVES, ADVERBS, NOT_VERBS } from './wortlisten-pos';

const ROOT = join('.superpowers', 'sdd', '2026-09-29-freestyle', 'wortlisten');
const PDF_DIR = join(ROOT, 'pdf');
const OUT_DIR = join(ROOT, 'candidates');

interface Source { id: string; first: number; last: number; columns: ColumnSpec[] }
const ONE: ColumnSpec[] = [{ from: 0, to: 9999 }];
const TWO: ColumnSpec[] = [{ from: 0, to: 300 }, { from: 300, to: 9999 }];
// Page ranges of the alphabetical lists (front matter, themed word groups and back pages skipped).
const GOETHE: Source[] = [
  { id: 'goethe-a1', first: 9, last: 27, columns: ONE },
  { id: 'goethe-a2', first: 8, last: 31, columns: TWO },
  { id: 'goethe-b1', first: 16, last: 102, columns: TWO },
];
const TELC: Source[] = ['a1', 'a2', 'b1'].map((l) => ({ id: `telc-${l}`, first: 1, last: 8, columns: TWO }));

const HEADING = /^(Alphabetische[rn]?|ALPHABETISCHER|Wortliste|Wortschatz|WORTSCHATZ|2)$/;
// Header and footer bands, side labels ("A2_Wortliste_04_050526", "VS_03"), and the list title on
// the first page.
function drop(first: number) {
  return (w: Word, p: Page) => w.y < 60 || w.y > 765 || /Wortliste_0|^VS_0/.test(w.t) || (p.n === first && HEADING.test(w.t));
}

function rowsOf(s: Source): Row[] {
  return readPages(join(PDF_DIR, `${s.id}.pdf`), s.first, s.last).flatMap((p) => pageRows(p, s.columns, drop(s.first)));
}

interface Parsed { id: string; entries: (Candidate & { source: string; page: number })[]; skipped: Skipped[] }

function parseGoethe(id: string, raws: RawEntry[], lists: PosLists): Parsed {
  const entries: Parsed['entries'] = [];
  const skipped: Skipped[] = [];
  for (const raw of raws) {
    const res = parseHeadword(raw.headword, lists);
    skipped.push(...res.skipped);
    const ex = firstExample(raw.examples);
    for (const e of res.entries) {
      const prev = entries[entries.length - 1];
      let example = ex;
      // "der Absender" / "die Absenderin": the feminine form shares the example printed beside both.
      if (!example && prev && e.partOfSpeech === 'noun' && prev.partOfSpeech === 'noun'
        && e.lemma.slice(4) === `${prev.lemma.slice(4)}in`) example = prev.example;
      entries.push({ ...e, example, source: raw.headword + (raw.examples[0] ? ` || ${raw.examples[0]}` : ''), page: raw.page });
    }
  }
  return { id, entries, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const sample = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 0;
  let seed = args.includes('--seed') ? Number(args[args.indexOf('--seed') + 1]) : 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

  const goetheRaw = GOETHE.map((s) => ({ id: s.id, raws: groupGoethe(rowsOf(s)) }));
  // First pass: every Goethe A2/B1 verb carries its forms ("hat/ist …"); collect those infinitives.
  const verbs = new Set<string>();
  const base: PosLists = { verbs, adjectives: ADJECTIVES, adverbs: ADVERBS, notVerbs: NOT_VERBS };
  for (const g of goetheRaw) for (const r of g.raws) {
    for (const e of parseHeadword(r.headword, base).entries) {
      if (/\b(hat|ist)\b/.test(r.headword) && e.partOfSpeech === 'verb') verbs.add(e.lemma.toLowerCase());
    }
  }
  const parsed: Parsed[] = goetheRaw.map((g) => parseGoethe(g.id, g.raws, base));

  const nouns = new Map<string, NounInfo>();
  for (const p of parsed) for (const e of p.entries) {
    if (e.partOfSpeech !== 'noun') continue;
    const [article, ...rest] = e.lemma.split(' ');
    const word = rest.join(' ');
    if (!nouns.has(word) || (!nouns.get(word)!.plural && e.plural)) nouns.set(word, { article, plural: e.plural });
  }
  // Goethe headwords printed without an article: look the article up in the other entries.
  for (const p of parsed) for (const e of p.entries) {
    if (!/^[A-ZÄÖÜ][\wäöüßÄÖÜ-]*$/.test(e.lemma) || !(e.partOfSpeech === 'noun' || e.partOfSpeech === 'other')) continue;
    const hit = lookupNoun(e.lemma, nouns, e.partOfSpeech === 'noun');
    if (!hit) continue;
    const kept = (e.note ?? '').split('; ').filter((n) => n && n !== 'article missing in source');
    e.lemma = `${hit.info.article} ${e.lemma}`;
    e.partOfSpeech = 'noun';
    e.plural = e.plural ?? hit.plural;
    e.note = ['article missing in source', hit.note, ...kept].join('; ');
  }
  for (const s of TELC) {
    const entries: Parsed['entries'] = [];
    const heads = groupTelc(rowsOf(s));
    // Every capitalised word in this list, split at "/", for the "-in" feminine check.
    const words = new Set(heads.flatMap((h) => h.headword.split(/[/\s(),]+/)));
    const known = (w: string) => nouns.has(w) || words.has(w);
    for (const h of heads) {
      for (const c of parseTelc(h.headword, nouns, base, known)) entries.push({ ...c, source: h.headword, page: h.page });
    }
    parsed.push({ id: s.id, entries, skipped: [] });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const p of parsed) {
    const out = p.entries.map(({ lemma, partOfSpeech, plural, example, note }) => ({
      lemma: lemma.normalize('NFC'), partOfSpeech, plural: plural?.normalize('NFC') ?? null,
      example: example.normalize('NFC'), ...(note ? { note: note.normalize('NFC') } : {}),
    }));
    writeFileSync(join(OUT_DIR, `${p.id}.json`), `${JSON.stringify(out, null, 1)}\n`);
    if (p.skipped.length) writeFileSync(join(OUT_DIR, `${p.id}.skipped.json`), `${JSON.stringify(p.skipped, null, 1)}\n`);
    const keys = new Map<string, number>();
    for (const e of p.entries) keys.set(lemmaKey(e.lemma), (keys.get(lemmaKey(e.lemma)) ?? 0) + 1);
    const dups = [...keys].filter(([, n]) => n > 1).map(([k]) => k);
    const pos = Object.entries(p.entries.reduce<Record<string, number>>((a, e) => ({ ...a, [e.partOfSpeech]: (a[e.partOfSpeech] ?? 0) + 1 }), {}));
    console.log(`${p.id}: ${p.entries.length} entries, ${p.entries.filter((e) => !e.example).length} without example, `
      + `${dups.length} duplicate lemmas [${dups.join(', ')}], ${p.skipped.length} skipped; ${pos.map(([k, n]) => `${k} ${n}`).join(', ')}`);
    for (let i = 0; i < sample; i++) {
      const e = p.entries[Math.floor(rand() * p.entries.length)];
      console.log(`  p${e.page} ${JSON.stringify({ lemma: e.lemma, pos: e.partOfSpeech, plural: e.plural, example: e.example, note: e.note })}\n      src: ${e.source}`);
    }
  }
  for (const level of ['a1', 'a2', 'b1']) {
    const g = parsed.find((p) => p.id === `goethe-${level}`)!;
    const t = parsed.find((p) => p.id === `telc-${level}`)!;
    const gk = new Set(g.entries.map((e) => lemmaKey(e.lemma)));
    const tk = new Set(t.entries.map((e) => lemmaKey(e.lemma)));
    const both = [...tk].filter((k) => gk.has(k)).length;
    console.log(`${level.toUpperCase()} overlap: ${both} lemmas in both (goethe ${gk.size}, telc ${tk.size}, union ${new Set([...gk, ...tk]).size})`);
  }
}

main();
