// Reads a Wortliste PDF into positioned lines, one stream per column. Used by extract-wortlisten.ts.
// pdftotext -layout flattens two-column pages into interleaved rows whose character columns drift,
// so the column split uses the word boxes from `pdftotext -bbox` (same poppler tool, exact points).
import { execFileSync } from 'node:child_process';

export interface Word { x: number; x2: number; y: number; t: string }
// One printed row inside one column: words left of `exX` are headword text, the rest example text.
export interface Row { page: number; col: number; y: number; hw: string; hwX: number; ex: string; exX: number }

const PDFTOTEXT = '/opt/homebrew/bin/pdftotext';

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
    .normalize('NFC');
}

export interface Page { n: number; width: number; height: number; words: Word[] }

export function readPages(pdf: string, first: number, last: number): Page[] {
  const html = execFileSync(PDFTOTEXT, ['-f', String(first), '-l', String(last), '-bbox', pdf, '-'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const pages: Page[] = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g;
  let m: RegExpExecArray | null;
  let n = first;
  while ((m = pageRe.exec(html))) {
    const words: Word[] = [];
    let w: RegExpExecArray | null;
    while ((w = wordRe.exec(m[3]))) words.push({ x: +w[1], y: +w[2], x2: +w[3], t: decode(w[4]) });
    pages.push({ n: n++, width: +m[1], height: +m[2], words });
  }
  return pages;
}

// Groups words into rows by their top edge (words of one printed row share yMin within ~2pt).
export function groupRows(words: Word[]): Word[][] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Word[][] = [];
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - w.y) < 2.5) last.push(w);
    else rows.push([w]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

const join = (ws: Word[]) => ws.map((w) => w.t).join(' ');

// The example column's left edge: the most common x of a word that starts a row or follows a wide
// gap, ignoring the headword margin. Rounded to whole points.
export function exampleColumn(rows: Word[][], hwX: number): number {
  const counts = new Map<number, number>();
  for (const r of rows) {
    r.forEach((w, i) => {
      const gap = i === 0 ? Infinity : w.x - r[i - 1].x2;
      if (gap > 5 && w.x > hwX + 40) counts.set(Math.round(w.x), (counts.get(Math.round(w.x)) ?? 0) + 1);
    });
  }
  // Merge neighbours (±1pt) so 106.5 and 107 count together.
  let best = 0;
  let bestN = -1;
  for (const [x] of counts) {
    const n = (counts.get(x - 1) ?? 0) + (counts.get(x) ?? 0) + (counts.get(x + 1) ?? 0);
    if (n > bestN || (n === bestN && x < best)) { best = x; bestN = n; }
  }
  return best;
}

export interface ColumnSpec { from: number; to: number }

// Splits one page into rows per column. `columns` gives each column's x range; `drop` removes
// header/footer words and other furniture before grouping.
export function pageRows(page: Page, columns: ColumnSpec[], drop: (w: Word, p: Page) => boolean): Row[] {
  const out: Row[] = [];
  columns.forEach((col, ci) => {
    const words = page.words.filter((w) => w.x >= col.from && w.x < col.to && !drop(w, page));
    if (!words.length) return;
    const rows = groupRows(words);
    const hwX = Math.min(...words.map((w) => w.x));
    const exX = exampleColumn(rows, hwX);
    for (const r of rows) {
      // B1 hangs its example numbers ("1.") 10pt left of the column, and some unnumbered examples
      // start at the hang too; allow 12pt of slack.
      // A word a little further left still opens the example when a wide gap separates it from
      // the headword ("die Pommes frites (pl.)      Die Kinder …").
      const isEx = (w: Word, i: number) => w.x >= exX - 12 || (w.x >= exX - 25 && i > 0 && w.x - r[i - 1].x2 > 8);
      const split = r.findIndex(isEx);
      const hw = split < 0 ? r : r.slice(0, split);
      const ex = split < 0 ? [] : r.slice(split);
      out.push({
        page: page.n, col: ci, y: r[0].y,
        hw: join(hw), hwX: hw.length ? hw[0].x - hwX : -1,
        ex: join(ex), exX: ex.length ? ex[0].x - exX : -1,
      });
    }
  });
  return out;
}
