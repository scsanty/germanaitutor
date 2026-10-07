// Groups the rows of a Goethe Wortliste into headwords with their example sentences.
// Layout (all three levels): a headword column and an example column; A2 and B1 print two such
// column pairs per page. Headwords wrap onto following rows (verb forms, "der Anruf-/beantworter"),
// examples wrap too, and B1 numbers its examples ("1.", "2.").
import type { Row } from './wortlisten-pdf';

export interface RawEntry { headword: string; examples: string[]; page: number; indent: number }

const TERMINAL = /[.!?…“”"»«)]$/;
const ARTICLE_START = /^(der|die|das)(\/(der|die|das))* /;

function joinText(a: string, b: string): string {
  if (!a) return b;
  // "Aben-" + "teuergeschichten" → one word; "Tennis-" + "Club" keeps its hyphen.
  if (/[a-zäöüß]-$/.test(a) && /^[a-zäöüß]/.test(b)) return a.slice(0, -1) + b;
  if (/-$/.test(a) && /^[A-ZÄÖÜ]/.test(b)) return a + b;
  return `${a} ${b}`;
}

function unbalanced(s: string): boolean {
  return (s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length;
}

// Does a headword fragment on row `idx` continue the headword `cur` (last fragment on row `lastIdx`)?
function continues(cur: string, text: string, idx: number, lastIdx: number, dy: number): boolean {
  const next = idx === lastIdx + 1;
  // "ist einverstanden" / "gewesen"; "hat sich etwas gefallen" / "lassen" (line spacing, where a
  // new headword sits further down).
  if (next && /^(gewesen|geworden)\b/.test(text)) return true;
  if (next && dy < 12.5 && /\b(hat|ist)\b/.test(cur) && !ARTICLE_START.test(cur) && /^[a-zäöüß]+$/.test(text)) return true;
  // "einverstanden" / "sein, ist einverstanden, …": a phrase verb wrapped before its auxiliary,
  // printed at line spacing (a new headword sits further down).
  if (next && dy < 12.5 && !cur.includes(',') && !ARTICLE_START.test(cur) && /^(sein|werden|haben),/.test(text)) return true;
  if (/^[-–¨→/)]/.test(text) || /^\((D|A|CH|Pl|Sg)\b/.test(text) || /^(D|A|CH)[,:]/.test(text)) return true;
  if (next && unbalanced(cur)) return true;
  // An article left at a row's end: "der/die" / "Bekannte, -n", "die Ehefrau, -en/der" / "Ehemann".
  if (/(^|[\s/])(der|die|das)$/.test(cur)) return true;
  // A bracketed note under the headword: "(z. B. Feierabend)", "(haben/machen)", "(sich), …".
  // "(ab)fahren", "(an-)/(aus)ziehen" and "(sich etwas) aussuchen" are headwords of their own.
  if (/^\(/.test(text) && !/^\([a-zäöüß/-]+\)\/?\(?[a-zäöüß]/.test(text) && !/^\([^)]*\) [a-zäöüß]/.test(text)) return true;
  // A noun's trailing comma only carries a plural or region on: "die Diskothek, -en/Disko," at a
  // column's foot is complete.
  if (/[,/:→]$/.test(cur) && !(ARTICLE_START.test(cur) && /,$/.test(cur) && !ARTICLE_START.test(text))) return true;
  // A cross-reference wraps onto the next rows: "… → D: in Rente" / "gehen/sein; CH: pen-" /
  // "sioniert werden/sein". Headwords never contain ";".
  if (next && cur.includes('→') && /^[a-zäöüß]/.test(text) && (text.includes(';') || /-$/.test(cur) || /^\S+\/\S+$/.test(text))) return true;
  // A hyphenated verb form: "hat ange-" / "wandt/angewendet".
  if (next && cur.includes(',') && !ARTICLE_START.test(cur) && /[a-zäöüß]-$/.test(cur) && /^[a-zäöüß]/.test(text)) return true;
  // A noun wrapped mid-word: "der Anruf-" / "beantworter, -". Without an article, "all-" and
  // "unser-" are complete stems.
  if (next && ARTICLE_START.test(cur) && /[a-zäöüß]-$/.test(cur) && /^[a-zäöüß]/.test(text)) return true;
  // B1 wraps verb forms mid-list: "abhängen, hängt ab, hing" / "ab, hat abgehangen (von)".
  const first = cur.split(',')[0];
  if (next && !ARTICLE_START.test(cur) && cur.includes(',') && !unbalanced(first)
    && /^[a-zäöü(]/.test(first) && /(en|ern|eln|n)( \([^)]*\))?$/.test(first)
    && !/\b(hat|ist) [^,]*[a-zäöüß]{3,}/.test(cur) && /^[a-zäöüß(]/.test(text)) return true;
  return false;
}

// `rows` must be in reading order: page by page, each column top to bottom.
export function groupGoethe(rows: Row[]): RawEntry[] {
  const out: RawEntry[] = [];
  let cur: RawEntry | null = null;
  let lastHwIdx = -10;
  let lastHwY = -100;
  let lastPageCol = '';
  rows.forEach((row, idx) => {
    let hw = row.hw.trim();
    let ex = row.ex.trim();
    // A hanging example number can fall left of the example column.
    // pdftotext sometimes glues it to the first word ("10.Komm").
    const num = hw.match(/(^|\s)(\d+\.)(\S*)$/);
    if (num) {
      hw = hw.slice(0, hw.length - num[2].length - num[3].length).trim();
      ex = `${num[2]} ${num[3]} ${ex}`.replace(/\s+/g, ' ').trim();
    }
    // A long headword's closing region tag can land in the example column: "(D," … "A)".
    const tag = ex.match(/^((?:D|A|CH)(?:,\s*(?:D|A|CH))*\))\s*/);
    if (tag && hw) { hw = `${hw} ${tag[1]}`; ex = ex.slice(tag[0].length); }
    // pdftotext glues "(pl.)  Die" into one word box, pulling the example's first word left.
    const glued = hw.match(/\)\s+([A-ZÄÖÜ][a-zäöüß]*)$/);
    if (glued) { hw = hw.slice(0, hw.length - glued[1].length).trim(); ex = `${glued[1]} ${ex}`; }
    if (/^[A-ZÄÖÜ]$/.test(hw)) hw = ''; // letter heading
    const pageCol = `${row.page}/${row.col}`;
    if (pageCol !== lastPageCol) lastHwIdx = -10; // never join a wrap across columns
    lastPageCol = pageCol;
    let prev: RawEntry | null = null;
    if (hw) {
      if (cur && continues(cur.headword, hw, idx, lastHwIdx, row.y - lastHwY)) {
        cur.headword = /[a-zäöüß]-$/.test(cur.headword) ? joinText(cur.headword, hw) : `${cur.headword} ${hw}`;
      } else {
        prev = cur;
        cur = { headword: hw, examples: [], page: row.page, indent: row.hwX };
        out.push(cur);
      }
      lastHwIdx = idx;
      lastHwY = row.y;
    }
    if (!ex || !cur) return;
    // An unfinished example sentence carries on, even when a new headword starts on this row
    // ("der Absender, -" / "die Absenderin, -nen" share one example).
    const target: RawEntry = prev && prev.examples.length && !/^\d+\./.test(ex)
      && !TERMINAL.test(prev.examples[prev.examples.length - 1]) ? prev : cur;
    const items = target.examples;
    const open = items.length && !TERMINAL.test(items[items.length - 1]) && !/^\d+\./.test(ex);
    if (open) items[items.length - 1] = joinText(items[items.length - 1], ex);
    else items.push(ex);
  });
  return out;
}

// The first example, without its number.
export function firstExample(examples: string[]): string {
  return (examples[0] ?? '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
}
