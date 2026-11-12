import { useEffect, useRef } from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { buildPageText, type GlyphItem } from "../text/search";
import { detectRtl } from "../text/arabic";

export type HighlightRect = { x: number; y: number; w: number; h: number; current: boolean };

type Props = {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  night: boolean;
  /** Rectangles in PDF user space (from pageLayout boxes). */
  highlights: HighlightRect[];
  width: number;
  height: number;
};

// Canvas pixels per CSS pixel. Capped so a weak laptop/phone isn't asked to paint 3× bitmaps.
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);

/**
 * One page: canvas + selectable text layer + search highlights.
 * Cancels its render and frees the bitmap on unmount, so only mounted pages cost memory.
 */
export default function PageView({ doc, pageNumber, scale, night, highlights, width, height }: Props) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<{ convertToViewportPoint(x: number, y: number): number[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | undefined;
    let layer: TextLayer | undefined;
    // A fresh canvas per render: pdf.js refuses a canvas whose previous render is still cancelling.
    const canvas = document.createElement("canvas");
    canvasHost.current!.replaceChildren(canvas);
    const textDiv = textRef.current!;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      viewportRef.current = viewport;
      const ratio = pixelRatio();
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      task = page.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      try {
        await task.promise;
      } catch {
        return; // cancelled
      }
      if (cancelled) return;
      const content = await page.getTextContent();
      if (cancelled) return;
      const items = content.items.filter((it) => "str" in it && it.str !== "") as unknown as GlyphItem[];
      textDiv.replaceChildren();
      textDiv.style.setProperty("--total-scale-factor", String(scale));
      layer = new TextLayer({
        textContentSource: { ...content, items: items as never },
        container: textDiv,
        viewport,
      });
      await layer.render();
      if (cancelled) return;
      // Remember which item each span shows, for reading-order copy of Arabic selections.
      const divs = layer.textDivs;
      if (divs.length === items.length) divs.forEach((d, i) => itemOf.set(d, items[i]));
    })().catch(() => {
      /* page left the screen or the document closed mid-render */
    });
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
      canvas.width = canvas.height = 0;
      canvas.remove();
      textDiv.replaceChildren();
    };
  }, [doc, pageNumber, scale]);

  // Search highlights as positioned boxes over the page.
  useEffect(() => {
    const host = hlRef.current;
    const vp = viewportRef.current;
    if (!host) return;
    host.replaceChildren();
    if (!vp) return;
    for (const r of highlights) {
      const [x1, y1] = vp.convertToViewportPoint(r.x, r.y);
      const [x2, y2] = vp.convertToViewportPoint(r.x + r.w, r.y + r.h);
      const el = document.createElement("div");
      el.className = r.current ? "hl current" : "hl";
      el.style.left = `${Math.min(x1, x2)}px`;
      el.style.top = `${Math.min(y1, y2)}px`;
      el.style.width = `${Math.abs(x2 - x1)}px`;
      el.style.height = `${Math.abs(y2 - y1)}px`;
      host.appendChild(el);
    }
    host.querySelector(".hl.current")?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [highlights, scale, width]);

  return (
    <div className="page" style={{ width, height }} data-page={pageNumber}>
      <div ref={canvasHost} className={night ? "canvas-host night" : "canvas-host"} />
      <div ref={hlRef} className="hl-layer" />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

// ---- Reading-order copy ---------------------------------------------------

const itemOf = new WeakMap<Element, GlyphItem>();

/**
 * Browsers copy text-layer spans in drawing order, which reverses Arabic from most PDFs.
 * When the selection is mostly Arabic, rebuild it from the selected glyph items instead.
 */
export function readingOrderSelection(sel: Selection): string | null {
  const plain = sel.toString();
  if (!plain.trim() || !detectRtl(plain) || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const root = range.commonAncestorContainer;
  const host = (root instanceof Element ? root : root.parentElement)?.closest(".pages") ?? document;
  const pages = new Map<string, GlyphItem[]>();
  host.querySelectorAll(".textLayer > span, .textLayer .markedContent > span").forEach((span) => {
    const item = itemOf.get(span);
    if (!item || !range.intersectsNode(span)) return;
    const page = span.closest(".page")?.getAttribute("data-page") ?? "";
    if (!pages.has(page)) pages.set(page, []);
    pages.get(page)!.push(item);
  });
  if (pages.size === 0) return null;
  return [...pages.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, items]) => buildPageText(items))
    .join("\n");
}
