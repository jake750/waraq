import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type PageLease = { page: PDFPageProxy; release(): void };

/**
 * A page borrowed for rendering. release() lets pdf.js drop its decoded images and operator
 * lists once in-flight renders end; without it every visited page stays in memory until close.
 */
export async function leasePage(doc: PDFDocumentProxy, pageNumber: number): Promise<PageLease> {
  const page = await doc.getPage(pageNumber);
  let released = false;
  return {
    page,
    release() {
      if (released) return;
      released = true;
      page.cleanup();
    },
  };
}
