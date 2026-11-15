import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * True when the first pages carry no text at all: a scan or photos of pages.
 * Search and copy find nothing there, so the reader says so up front instead of after a failed search.
 */
export async function looksScanned(doc: PDFDocumentProxy, pages = 3): Promise<boolean> {
  const n = Math.min(pages, doc.numPages);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    if (text.items.some((it) => "str" in it && it.str.trim() !== "")) return false;
  }
  return n > 0;
}
