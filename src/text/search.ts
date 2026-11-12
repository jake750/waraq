import type { PDFDocumentProxy } from "pdfjs-dist";
import { detectRtl, foldChar, isRemovable } from "./arabic";

// ---------------------------------------------------------------------------
// Page text in reading order
//
// PDFs draw glyphs left to right, so Arabic arrives in *visual* order, often one
// glyph per item, as presentation forms (ﺻ ﻔ ﻟ) with harakat as separate items.
// pdf.js only reverses items it thinks are RTL. We undo that, put every glyph back
// at its x position, rebuild lines by baseline, attach marks to their letter, then
// convert each line to logical order (RTL lines reversed, Latin/digit runs kept).
// ---------------------------------------------------------------------------

export type GlyphItem = {
  str: string;
  dir: string;
  width: number;
  height: number;
  hasEOL: boolean;
  transform: number[];
};

type Kind = "L" | "R" | "N";
type Cluster = { text: string; x: number; w: number; y: number; size: number; kind: Kind; space: boolean };
/** `ch` is a letter with any marks that arrived in the same item, or a lone mark run. */
type Glyph = { ch: string; x: number; w: number; y: number; size: number };

const MARK = /\p{Mn}/u;
const PRESENTATION = /[ﭐ-﷿ﹰ-﻿]/;
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[\p{L}\p{Nd}]/u; // letters (non-RTL) and digits: digits keep LTR order inside Arabic

function kindOf(text: string): Kind {
  const c = text[0] ?? "";
  if (RTL_CHAR.test(c) && !/\p{Nd}/u.test(c)) return "R";
  if (LTR_CHAR.test(c)) return "L";
  return "N";
}

// Fonts like Arial share one glyph between Arabic letters and their Persian/Urdu twins, and PDF
// writers often name the glyph by the Persian form. Initial/medial forms look identical, so read
// them as Arabic; dotless final/isolated Farsi yeh reads as alef maksura (same shape).
const SHARED_FORMS: Record<string, string> = {
  "ﯼ": "ى",
  "ﯽ": "ى",
  "ﯾ": "ي",
  "ﯿ": "ي",
  "ﮪ": "ه",
  "ﮫ": "ه",
  "ﮬ": "ه",
  "ﮭ": "ه",
  "ﮐ": "ك",
  "ﮑ": "ك",
};

/** Presentation forms → normal letters (ﻻ → لا, ﺻ → ص). Isolated mark forms lose NFKC's leading space. */
function unpresent(c: string): string {
  if (SHARED_FORMS[c]) return SHARED_FORMS[c];
  return PRESENTATION.test(c) ? c.normalize("NFKC").replace(/^ (?=\p{Mn})/u, "") : c;
}

function explode(items: GlyphItem[]): Glyph[] {
  const out: Glyph[] = [];
  for (const it of items) {
    if (!it.str) continue;
    // Group each letter with the marks that follow it in the item (pdf.js strings are logical
    // within a letter), so a haraka delivered together with its letter stays on it.
    const units: string[] = [];
    for (const raw of it.str) {
      const ch = raw === "\u0000" ? raw : unpresent(raw);
      if (isMarkRun(ch) && units.length && !/\s$/.test(units[units.length - 1])) units[units.length - 1] += ch;
      else units.push(ch);
    }
    // pdf.js reversed RTL items into logical order; turn them back into drawing order.
    if (it.dir === "rtl") units.reverse();
    const [a, b, c, d, x, y] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10;
    const step = units.length ? it.width / units.length : 0;
    units.forEach((ch, i) => {
      // Zero-width whitespace (writers glue it to harakat) is not a word break.
      if (step < 0.5 && /^\s+$/.test(ch)) return;
      out.push({ ch: step < 0.5 ? ch.replace(/\s+/g, "") : ch, x: x + step * i, w: step, y, size });
    });
  }
  return out;
}

function groupLines(glyphs: Glyph[]): Glyph[][] {
  const lines: { y: number; size: number; glyphs: Glyph[] }[] = [];
  for (const g of glyphs) {
    const line = lines.find((l) => Math.abs(l.y - g.y) <= Math.max(l.size, g.size) * 0.5);
    if (line) line.glyphs.push(g);
    else lines.push({ y: g.y, size: g.size, glyphs: [g] });
  }
  return lines.sort((p, q) => q.y - p.y).map((l) => l.glyphs);
}

const isMarkRun = (s: string): boolean => s !== "" && [...s].every((c) => MARK.test(c));

function clustersOf(line: Glyph[]): Cluster[] {
  const bases = line.filter((g) => !isMarkRun(g.ch)).sort((p, q) => p.x - q.x);
  const marks = line.filter((g) => isMarkRun(g.ch));
  const clusters: Cluster[] = bases.map((g) => {
    // A glyph with no Unicode value (\u0000) still occupies its place, so it must not open a gap.
    const text = g.ch.replace(/\u0000/g, "");
    return { text, x: g.x, w: g.w, y: g.y, size: g.size, kind: kindOf(text), space: text !== "" && text.trim() === "" };
  });
  // Writers place a mark at (or a hair before) the leading edge of its letter's box, so the
  // owner is the letter whose half-open box [x - 0.5, x + w) holds the mark; when two do, the
  // right-hand one. Otherwise the nearest letter centre.
  const owners = new Map<Cluster, string>();
  for (const m of marks) {
    let best: Cluster | undefined;
    for (const cl of clusters)
      if (!cl.space && m.x >= cl.x - 0.5 && m.x < cl.x + Math.max(cl.w, 0.5) && (!best || cl.x > best.x)) best = cl;
    if (!best) {
      let bestDist = Infinity;
      for (const cl of clusters) {
        const dist = Math.abs(m.x - (cl.x + cl.w / 2));
        if (!cl.space && dist < bestDist) {
          bestDist = dist;
          best = cl;
        }
      }
    }
    if (best) owners.set(best, (owners.get(best) ?? "") + m.ch);
  }
  // Marks go after the first letter, so a lam-alef ligature (ﻻ → لا) keeps its haraka on the lam.
  for (const [cl, m] of owners) {
    const chars = [...cl.text];
    let k = 1;
    while (k < chars.length && MARK.test(chars[k])) k++;
    cl.text = chars.slice(0, k).join("") + m + chars.slice(k).join("");
  }
  // Fill gaps the PDF left without a space character.
  const size = line[0]?.size ?? 10;
  const withGaps: Cluster[] = [];
  clusters.forEach((cl, i) => {
    const prev = clusters[i - 1];
    if (prev && !prev.space && !cl.space && cl.x - (prev.x + prev.w) > size * 0.3)
      withGaps.push({
        text: " ",
        x: prev.x + prev.w,
        w: cl.x - (prev.x + prev.w),
        y: cl.y,
        size: cl.size,
        kind: "N",
        space: true,
      });
    withGaps.push(cl);
  });
  return withGaps;
}

/** Visual (left→right) clusters of one line → clusters in reading order. */
function logical(clusters: Cluster[]): Cluster[] {
  const rtl = detectRtl(clusters.map((c) => c.text).join(""));
  let seq = clusters;
  if (rtl) {
    seq = [...clusters].reverse();
    // Runs of Latin letters/digits (with neutrals between them) read left→right: flip them back.
    const out: Cluster[] = [];
    let i = 0;
    while (i < seq.length) {
      if (seq[i].kind !== "L") {
        out.push(seq[i++]);
        continue;
      }
      let j = i;
      let lastL = i;
      while (j < seq.length && seq[j].kind !== "R") {
        if (seq[j].kind === "L") lastL = j;
        j++;
      }
      out.push(...seq.slice(i, lastL + 1).reverse());
      i = lastL + 1;
    }
    seq = out;
  }
  return seq;
}

/** Where a character sits on the page, in PDF user space (y up). */
export type Box = { x: number; y: number; w: number; h: number };
export type PageLayout = { text: string; boxes: Box[] };

/** Page text in reading order plus one box per UTF-16 unit of that text. */
export function buildPageLayout(items: GlyphItem[]): PageLayout {
  let text = "";
  const boxes: Box[] = [];
  for (const line of groupLines(explode(items))) {
    let lineText = "";
    const lineBoxes: Box[] = [];
    for (const cl of logical(clustersOf(line))) {
      const box = { x: cl.x, y: cl.y - cl.size * 0.22, w: cl.w, h: cl.size * 1.1 };
      if (cl.text === "") continue; // glyph without a Unicode value
      if (cl.space) {
        if (lineText !== "" && !lineText.endsWith(" ")) {
          lineText += " ";
          lineBoxes.push(box);
        }
        continue;
      }
      // NFC per letter: canonical order of stacked harakat (e.g. damma before shadda).
      const t = cl.text.normalize("NFC");
      lineText += t;
      for (let i = 0; i < t.length; i++) lineBoxes.push(box);
    }
    if (lineText.endsWith(" ")) {
      lineText = lineText.slice(0, -1);
      lineBoxes.pop();
    }
    if (lineText === "") continue;
    if (text !== "") {
      text += "\n";
      boxes.push({ ...lineBoxes[0], w: 0 });
    }
    text += lineText;
    boxes.push(...lineBoxes);
  }
  return { text, boxes };
}

export function buildPageText(items: GlyphItem[]): string {
  return buildPageLayout(items).text;
}

export async function pageLayout(doc: PDFDocumentProxy, pageIndex: number): Promise<PageLayout> {
  const tc = await (await doc.getPage(pageIndex + 1)).getTextContent();
  return buildPageLayout(tc.items.filter((it) => "str" in it) as unknown as GlyphItem[]);
}

export async function pageText(doc: PDFDocumentProxy, pageIndex: number): Promise<string> {
  return (await pageLayout(doc, pageIndex)).text;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchOpts = { loose: boolean; caseSensitive: boolean };
export type Match = { page: number; start: number; end: number };

/** Folded copy of `s` plus, for every folded char, its index in `s`. */
function fold(s: string, opts: SearchOpts): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (opts.loose) c = foldChar(c);
    if (!opts.caseSensitive) c = c.toLowerCase();
    for (const _ of c) map.push(i);
    text += c;
  }
  return { text, map };
}

export function findMatches(pages: string[], query: string, opts: SearchOpts): Match[] {
  const q = fold(query.trim(), opts).text;
  if (!q) return [];
  const out: Match[] = [];
  pages.forEach((page, p) => {
    const { text, map } = fold(page, opts);
    let from = 0;
    for (;;) {
      const at = text.indexOf(q, from);
      if (at < 0) break;
      let end = map[at + q.length - 1] + 1;
      if (opts.loose) while (end < page.length && isRemovable(page[end])) end++;
      out.push({ page: p, start: map[at], end });
      from = at + q.length;
    }
  });
  return out;
}
