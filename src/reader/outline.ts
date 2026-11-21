import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageLayout, type PageLayout } from "../text/search";

export type OutlineItem = { title: string; page: number /* 1-based */; depth: number };

type RawNode = { title: string; dest: string | unknown[] | null; items: RawNode[] };

export async function pageOf(doc: PDFDocumentProxy, dest: RawNode["dest"]): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target = explicit[0];
    if (typeof target === "number") return target + 1;
    return (await doc.getPageIndex(target as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1;
  } catch {
    return null;
  }
}

/** Table of contents as a flat list; entries whose destination can't be resolved are dropped. */
export async function flattenOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const root = (await doc.getOutline()) as RawNode[] | null;
  const out: OutlineItem[] = [];
  const walk = async (nodes: RawNode[], depth: number) => {
    for (const node of nodes) {
      const page = await pageOf(doc, node.dest);
      if (page) out.push({ title: node.title.trim(), page, depth });
      if (node.items?.length) await walk(node.items, depth + 1);
    }
  };
  if (root) await walk(root, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Contents built from headings, for the many PDFs that carry no outline
// ---------------------------------------------------------------------------

type Line = { text: string; size: number; y: number };

/** The lines of a page with the font size of each (a box is 1.1 × the size, see `buildPageLayout`). */
function linesOf(l: PageLayout): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (let i = 0; i <= l.text.length; i++) {
    if (i < l.text.length && l.text[i] !== "\n") continue;
    let size = 0;
    for (let k = start; k < i; k++) size = Math.max(size, l.boxes[k]?.h ?? 0);
    const text = l.text.slice(start, i).trim();
    if (text) out.push({ text, size: Math.round((size / 1.1) * 2) / 2, y: l.boxes[start]?.y ?? 0 });
    start = i + 1;
  }
  return out;
}

const HEADING_MAX_CHARS = 120;

/**
 * Headings found by size: lines set clearly larger than the body text (the size most letters use),
 * short, with a letter in them, and not repeated on many pages (running heads). Lines of one heading
 * that wraps are joined. The largest sizes become the top levels (at most three).
 */
export function headingsFromLayouts(pages: PageLayout[]): OutlineItem[] {
  const perPage = pages.map(linesOf);
  const weight = new Map<number, number>();
  for (const ls of perPage) for (const l of ls) weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  let body = 0;
  let most = -1;
  for (const [s, n] of weight) if (n > most || (n === most && s < body)) [body, most] = [s, n];
  if (!body) return [];

  const found: { text: string; size: number; page: number }[] = [];
  perPage.forEach((ls, p) => {
    let prev: (typeof found)[number] | null = null;
    let prevY = 0;
    for (const l of ls) {
      const big = l.size >= body * 1.2 && l.text.length <= HEADING_MAX_CHARS && /\p{L}/u.test(l.text);
      if (!big) {
        prev = null;
        continue;
      }
      // The next line of the same heading: same size, right below.
      if (prev && prev.size === l.size && Math.abs(prevY - l.y) < l.size * 2 && prev.text.length + l.text.length <= HEADING_MAX_CHARS) prev.text += " " + l.text;
      else found.push((prev = { text: l.text, size: l.size, page: p + 1 }));
      prevY = l.y;
    }
  });

  const seen = new Map<string, number>();
  for (const h of found) seen.set(h.text, (seen.get(h.text) ?? 0) + 1);
  const kept = found.filter((h) => (seen.get(h.text) ?? 0) < 3 || pages.length < 3);
  // Too many "headings" means the big text is the body itself (a slide deck, a poster): not a contents.
  if (!kept.length || kept.length > Math.max(12, pages.length * 6)) return [];
  const levels = [...new Set(kept.map((h) => h.size))].sort((a, b) => b - a);
  return kept.map((h) => ({ title: h.text, page: h.page, depth: Math.min(2, levels.indexOf(h.size)) }));
}

/** Pages read for headings at most; a long book is still listed up to there. */
export const HEADING_PAGES = 400;

export async function headingOutline(doc: PDFDocumentProxy, read = pageLayout): Promise<OutlineItem[]> {
  const pages: PageLayout[] = [];
  const n = Math.min(doc.numPages, HEADING_PAGES);
  for (let i = 0; i < n; i++) pages.push(await read(doc, i).catch(() => ({ text: "", boxes: [] })));
  return headingsFromLayouts(pages);
}
