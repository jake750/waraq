import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageCanvas } from "../pdf/pageCanvas";

/** A small JPEG of page 1 for the Recent list (about 3–6 KB). */
export async function firstPageThumb(doc: PDFDocumentProxy, width = 72): Promise<string> {
  // No page.cleanup() afterwards: the reader may be drawing the same page at this moment.
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = pageCanvas();
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.7);
  canvas.width = canvas.height = 0;
  return url;
}
