// PDF → text, Markdown, DOCX (from the Plan 1 reading-order layout) and PDF → page images.
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageLayout, type PageLayout } from "../text/search";
import { detectRtl } from "../text/arabic";
import { escapeHtml } from "./sanitize";
import { htmlToDocx } from "./fromHtml";

export type Line = { text: string; size: number; baseline: number };
export type Para = { text: string; heading: boolean; rtl: boolean };

/** Lines of a page layout with their font size and baseline (from the per-character boxes). Lone page numbers are dropped. */
export function linesOf(layout: PageLayout): Line[] {
  const out: Line[] = [];
  let start = 0;
  const parts = layout.text.split("\n");
  for (const text of parts) {
    const boxes = layout.boxes.slice(start, start + text.length).filter((b) => b.h > 0);
    start += text.length + 1; // + the "\n" box
    if (!text.trim() || /^[\d٠-٩\s\-–—|]+$/.test(text)) continue;
    const sizes = boxes.map((b) => b.h / 1.1).sort((a, b) => a - b);
    const size = sizes[Math.floor(sizes.length / 2)] ?? 12;
    const baseline = boxes.length ? boxes[0].y + 0.22 * size : 0;
    out.push({ text, size, baseline });
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 12;
};

/** Joins lines into paragraphs: a new paragraph on a size change or a gap wider than 1.5× the line height. */
export function paragraphsOf(lines: Line[], bodySize: number): Para[] {
  const paras: Para[] = [];
  let cur: Line[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((l) => l.text.trim()).join(" ");
    paras.push({ text, heading: cur[0].size >= bodySize * 1.25, rtl: detectRtl(text) });
    cur = [];
  };
  for (const l of lines) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = Math.abs(prev.baseline - l.baseline);
      const sizeChange = Math.abs(prev.size - l.size) > Math.max(1, prev.size * 0.15);
      if (sizeChange || gap > Math.max(prev.size, l.size) * 1.5 || l.baseline > prev.baseline) flush();
    }
    cur.push(l);
  }
  flush();
  return paras;
}

/** All paragraphs of the document, page by page. */
export async function pdfParagraphs(doc: PDFDocumentProxy, onPage?: (done: number) => void, signal?: AbortSignal): Promise<Para[][]> {
  const pages: Line[][] = [];
  for (let i = 0; i < doc.numPages; i++) {
    if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
    pages.push(linesOf(await pageLayout(doc, i)));
    onPage?.(i + 1);
  }
  const body = median(pages.flat().map((l) => l.size));
  return pages.map((lines) => paragraphsOf(lines, body));
}

export async function pdfToText(doc: PDFDocumentProxy, onPage?: (n: number) => void, signal?: AbortSignal): Promise<string> {
  const pages = await pdfParagraphs(doc, onPage, signal);
  return pages.map((ps) => ps.map((p) => p.text).join("\n\n")).filter(Boolean).join("\n\n") + "\n";
}

export async function pdfToMarkdown(doc: PDFDocumentProxy, onPage?: (n: number) => void, signal?: AbortSignal): Promise<string> {
  const pages = await pdfParagraphs(doc, onPage, signal);
  return (
    pages
      .map((ps) => ps.map((p) => (p.heading ? `# ${p.text}` : p.text.replace(/^([#>*+-]|\d+\.)\s/, "\\$1 "))).join("\n\n"))
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}

export function paragraphsToHtml(pages: Para[][]): string {
  return pages
    .flat()
    .map((p) => {
      const dir = p.rtl ? "rtl" : "ltr";
      return p.heading ? `<h2 dir="${dir}">${escapeHtml(p.text)}</h2>` : `<p dir="${dir}">${escapeHtml(p.text)}</p>`;
    })
    .join("\n");
}

export async function pdfToDocx(doc: PDFDocumentProxy, onPage?: (n: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const pages = await pdfParagraphs(doc, onPage, signal);
  return htmlToDocx("", paragraphsToHtml(pages));
}

/** One page as PNG/JPG at `dpi` (browser only: uses a canvas). The bitmap is capped at ~40 MP. */
export async function renderPageImage(doc: PDFDocumentProxy, pageIndex: number, fmt: "png" | "jpg", dpi: number): Promise<Uint8Array> {
  const page = await doc.getPage(pageIndex + 1);
  try {
    const unit = page.getViewport({ scale: 1 });
    const scale = Math.min(dpi / 72, Math.sqrt(40e6 / (unit.width * unit.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // JPG has no transparency; PNG gets a white page like paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, fmt === "png" ? "image/png" : "image/jpeg", 0.9));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("encode failed");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    page.cleanup();
  }
}
