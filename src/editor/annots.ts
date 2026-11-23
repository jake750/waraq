// Annotations already in a PDF → editor marks, so they can be moved, restyled or deleted like new
// ones. The kinds the editor can write back are taken out of the file the editor shows and saves
// from (and written again from the marks on save); everything else (links, form fields, stamps
// with pictures, popups of kinds we keep) stays in the file untouched.

import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFDocument, type PDFObject } from "pdf-lib";
import { loadPdf } from "../tools/pages";
import { newId, type Mark, type Pt, type Rect, type Rgb } from "./marks";

/** Our own entry on filled shapes: how strongly the inside is painted (0..1). Other readers ignore it. */
export const FILL_KEY = "WaraqFill";

const num = (o: PDFObject | undefined): number | undefined => (o instanceof PDFNumber ? o.asNumber() : undefined);
const nums = (o: PDFObject | undefined): number[] => (o instanceof PDFArray ? o.asArray().map((x) => num(x) ?? 0) : []);

function text(o: PDFObject | undefined): string {
  return o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : "";
}

/** A colour array (gray, RGB or CMYK) as RGB; undefined when missing or empty. */
export function rgbOfArray(c: number[]): Rgb | undefined {
  if (c.length === 1) return [c[0], c[0], c[0]];
  if (c.length === 3) return [c[0], c[1], c[2]];
  if (c.length === 4) return [(1 - c[0]) * (1 - c[3]), (1 - c[1]) * (1 - c[3]), (1 - c[2]) * (1 - c[3])];
  return undefined;
}

/** Font size and colour from a FreeText default appearance, e.g. "/Helv 12 Tf 0 0 1 rg". */
export function parseDA(da: string): { size: number; color: Rgb } {
  const size = Number(/([\d.]+)\s+Tf/.exec(da)?.[1]) || 12;
  const rg = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da);
  const g = /([\d.]+)\s+g(?:\s|$)/.exec(da);
  const color: Rgb = rg ? [Number(rg[1]), Number(rg[2]), Number(rg[3])] : g ? [Number(g[1]), Number(g[1]), Number(g[1])] : [0, 0, 0];
  return { size, color };
}

/** QuadPoints (8 numbers per quad, any corner order) as one rect per quad. */
export function quadRects(q: number[]): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i + 7 < q.length; i += 8) {
    const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]];
    const ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    out.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
  }
  return out;
}

/** One annotation as a mark, or null for kinds (and shapes of data) the editor can't write back. */
export function markOf(d: PDFDict, page: number): Mark | null {
  const sub = d.lookup(PDFName.of("Subtype"));
  const kind = sub instanceof PDFName ? sub.decodeText() : "";
  const flags = num(d.lookup(PDFName.of("F"))) ?? 0;
  if (flags & 2) return null; // hidden
  const rect = nums(d.lookup(PDFName.of("Rect")));
  const [x0, y0, x1, y1] = rect.length === 4 ? [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])] : [0, 0, 0, 0];
  const color = rgbOfArray(nums(d.lookup(PDFName.of("C")))) ?? [0, 0, 0];
  const bs = d.lookup(PDFName.of("BS"));
  const width = (bs instanceof PDFDict ? num(bs.lookup(PDFName.of("W"))) : undefined) ?? 1;
  const style = bs instanceof PDFDict ? bs.lookup(PDFName.of("S")) : undefined;
  const dash = style instanceof PDFName && style.decodeText() === "D";
  const ca = num(d.lookup(PDFName.of("CA")));
  const look = { ...(dash ? { dash: true } : {}), ...(ca !== undefined && ca < 1 ? { opacity: ca } : {}) };
  const base = { id: newId(), page };
  const contents = text(d.lookup(PDFName.of("Contents")));

  switch (kind) {
    case "Square":
    case "Circle": {
      // RD gives the inner box; without it the border straddles the Rect's edge.
      const rd = nums(d.lookup(PDFName.of("RD")));
      const [l, b, r, t] = rd.length === 4 ? rd : [width / 2, width / 2, width / 2, width / 2];
      const ic = rgbOfArray(nums(d.lookup(PDFName.of("IC"))));
      const fill = ic ? (num(d.lookup(PDFName.of(FILL_KEY))) ?? 1) : 0;
      if (x1 - x0 <= l + r || y1 - y0 <= b + t) return null;
      return { ...base, kind: kind === "Square" ? "rect" : "ellipse", a: [x0 + l, y0 + b], b: [x1 - r, y1 - t], color, width, ...look, ...(fill ? { fill } : {}) };
    }
    case "Line": {
      const l = nums(d.lookup(PDFName.of("L")));
      if (l.length !== 4) return null;
      const le = d.lookup(PDFName.of("LE"));
      const ends = le instanceof PDFArray ? le.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : "None")) : [];
      const arrow = /Arrow/.test(ends[1] ?? "");
      return { ...base, kind: arrow ? "arrow" : "line", a: [l[0], l[1]], b: [l[2], l[3]], color, width, ...look };
    }
    case "Ink": {
      const list = d.lookup(PDFName.of("InkList"));
      if (!(list instanceof PDFArray)) return null;
      const paths = list.asArray().map((p) => {
        const n = nums(p instanceof PDFRef ? d.context.lookup(p) : p);
        const pts: Pt[] = [];
        for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
        return pts;
      });
      return paths.some((p) => p.length) ? { ...base, kind: "ink", paths: paths.filter((p) => p.length), color, width, ...look } : null;
    }
    case "Highlight":
    case "Underline":
    case "StrikeOut": {
      const rects = quadRects(nums(d.lookup(PDFName.of("QuadPoints"))));
      if (!rects.length) return null;
      const k = kind === "Highlight" ? "highlight" : kind === "Underline" ? "underline" : "strike";
      return { ...base, kind: k, rects, color, ...(contents ? { text: contents } : {}) };
    }
    case "Text":
      return rect.length === 4 ? { ...base, kind: "note", at: [x0, y1], text: contents, color } : null;
    case "FreeText": {
      if (rect.length !== 4 || !contents.trim()) return null;
      const { size, color: c } = parseDA(text(d.lookup(PDFName.of("DA"))) || "");
      const q = num(d.lookup(PDFName.of("Q"))) ?? 0;
      return { ...base, kind: "text", at: [x0 + 2, y1 - 2], width: Math.max(30, x1 - x0 - 4), text: contents, size, color: c, align: q === 1 ? "center" : q === 2 ? "end" : "start" };
    }
    default:
      return null;
  }
}

/**
 * The marks for every annotation the editor can edit, and the PDF without those annotations (and
 * their popups). `bytes` is the input itself when there is nothing to take out.
 */
export async function importAnnots(input: Uint8Array, parsed?: PDFDocument): Promise<{ bytes: Uint8Array; marks: Mark[]; pdf?: PDFDocument }> {
  let pdf: PDFDocument;
  try {
    // `parsed` (the same bytes, already loaded by the caller) saves a parse; it is changed here.
    pdf = parsed ?? (await loadPdf(input.slice()));
  } catch {
    return { bytes: input, marks: [] };
  }
  const marks: Mark[] = [];
  pdf.getPages().forEach((page, i) => {
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) return;
    const drop = new Set<PDFObject>();
    const popups = new Set<PDFObject>();
    for (const ref of annots.asArray()) {
      const d = pdf.context.lookup(ref);
      if (!(d instanceof PDFDict)) continue;
      const m = markOf(d, i);
      if (!m) continue;
      marks.push(m);
      drop.add(ref);
      const pop = d.get(PDFName.of("Popup"));
      if (pop) popups.add(pop);
    }
    if (!drop.size) return;
    const keep = annots.asArray().filter((r) => !drop.has(r) && !popups.has(r));
    page.node.set(PDFName.of("Annots"), pdf.context.obj(keep));
  });
  // `pdf` is handed back (the form fields are read from it next): annotations other than marks are untouched.
  if (!marks.length) return { bytes: input, marks, pdf };
  return { bytes: await pdf.save({ useObjectStreams: true }), marks, pdf };
}
