// PDF page tools as one model: an output is a list of pages taken from source PDFs (or blank).
// Merge, split, extract, delete, rotate, reorder and insert are all "build this list".

import { PDFDocument, degrees, EncryptedPDFError } from "pdf-lib";
import { ConvertError } from "../convert/errors";

export type PageSpec = { src: number; index: number; rotate: number } | { blank: [number, number] };
export type SplitMode = { kind: "each" } | { kind: "every"; n: number } | { kind: "ranges"; text: string };

const asciiDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** "3, 1-2, 5-" → 0-based pages in the given order. null if anything is invalid or out of 1..pageCount. */
export function parseRanges(text: string, pageCount: number): number[] | null {
  const parts = asciiDigits(text)
    .split(/[,،]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  for (const p of parts) {
    const m = /^(\d+)\s*(?:[-–—]\s*(\d*))?$/.exec(p);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : m[2] === "" ? pageCount : Number(m[2]);
    if (a < 1 || b > pageCount || a > b) return null;
    for (let i = a; i <= b; i++) out.push(i - 1);
  }
  return out;
}

/** Page groups for split. Ranges mode: groups separated by ";" (e.g. "1-3; 4-6"). */
export function splitGroups(pageCount: number, mode: SplitMode): number[][] | null {
  if (mode.kind === "each") return Array.from({ length: pageCount }, (_, i) => [i]);
  if (mode.kind === "every") {
    const n = Math.max(1, Math.floor(mode.n));
    const groups: number[][] = [];
    for (let i = 0; i < pageCount; i += n) groups.push(Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k));
    return groups;
  }
  const groups: number[][] = [];
  for (const g of mode.text.split(/[;؛\n]/).filter((s) => s.trim())) {
    const pages = parseRanges(g, pageCount);
    if (!pages) return null;
    groups.push(pages);
  }
  return groups.length ? groups : null;
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (e instanceof EncryptedPDFError || /encrypted/i.test(String(e))) throw new ConvertError("protected");
    throw new ConvertError("bad-input", String(e));
  }
}

/** Builds a new PDF from `pages`. Each source is parsed once; pages keep their own size. */
export async function assemble(sources: Uint8Array[], pages: PageSpec[]): Promise<Uint8Array> {
  const docs = new Map<number, PDFDocument>();
  const out = await PDFDocument.create();
  for (const spec of pages) {
    if ("blank" in spec) {
      out.addPage(spec.blank);
      continue;
    }
    let src = docs.get(spec.src);
    if (!src) {
      src = await loadPdf(sources[spec.src]);
      docs.set(spec.src, src);
    }
    const [page] = await out.copyPages(src, [spec.index]);
    if (spec.rotate) page.setRotation(degrees((((page.getRotation().angle + spec.rotate) % 360) + 360) % 360));
    out.addPage(page);
  }
  return out.save({ useObjectStreams: true });
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdf(bytes)).getPageCount();
}
