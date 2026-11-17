// Small whole-document edits: page numbers on every page, and stripping identifying metadata.

import { PDFDict, PDFName, StandardFonts, rgb } from "pdf-lib";
import { loadPdf } from "./pages";

export type NumberPos = "center" | "outer";
export type NumberOpts = { pos: NumberPos; start: number; skipFirst: boolean; format: "n" | "n-of" };

/** The label drawn on page `i` (0-based) of `count`, or null when that page gets none. */
export function pageLabel(i: number, count: number, o: NumberOpts): string | null {
  if (o.skipFirst && i === 0) return null;
  const n = o.start + i - (o.skipFirst ? 1 : 0);
  const last = o.start + count - 1 - (o.skipFirst ? 1 : 0);
  return o.format === "n-of" ? `${n} / ${last}` : String(n);
}

/** Adds page numbers at the bottom of each page (centred, or on the outer edge: right on odd pages, left on even). */
export async function numberPages(bytes: Uint8Array, o: NumberOpts): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 10;
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = pageLabel(i, pages.length, o);
    if (!label) return;
    const box = page.getCropBox();
    const w = font.widthOfTextAtSize(label, size);
    const margin = Math.max(18, Math.min(36, box.height * 0.04));
    const odd = (i + 1) % 2 === 1;
    const x =
      o.pos === "center" ? box.x + (box.width - w) / 2 : odd ? box.x + box.width - margin - w : box.x + margin;
    page.drawText(label, { x, y: box.y + margin * 0.75, size, font, color: rgb(0.25, 0.25, 0.28) });
  });
  return doc.save();
}

const INFO_KEYS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"];

/** Removes the document information (title, author, apps, dates) and the XMP metadata stream. */
export async function stripMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const infoRef = doc.context.trailerInfo.Info;
  const info = infoRef ? doc.context.lookup(infoRef) : undefined;
  if (info instanceof PDFDict) {
    for (const k of info.keys()) info.delete(k);
    for (const k of INFO_KEYS) info.delete(PDFName.of(k));
  }
  doc.catalog.delete(PDFName.of("Metadata"));
  return doc.save();
}
