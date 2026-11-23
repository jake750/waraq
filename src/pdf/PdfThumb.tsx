import { memo, useEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { pageCanvas } from "./pageCanvas";
import { useNear } from "./useNear";
import { leasePage, type PageLease } from "../reader/pageLease";
import { applyNight, solidRadius } from "../reader/night";

type Props = {
  doc: PDFDocumentProxy;
  index: number;
  /** Box size in CSS pixels; the page is fitted to `width` (and to `height` too when `fitBox`). */
  width: number;
  height: number;
  /** Added to the page's own rotation. */
  rotate?: number;
  /** Fit the longer side into the box (tools grid) instead of the width (reader list). */
  fitBox?: boolean;
  /** The reader's night tone (images kept in colour). */
  night?: boolean;
  className?: string;
  margin?: number;
};

/** One page rendered small, only while near the screen (reader thumbnails and the page tools). */
export default memo(function PdfThumb({ doc, index, width, height, rotate = 0, fitBox = false, night = false, className, margin = 400 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const near = useNear(host, margin);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    let lease: PageLease | undefined;
    const canvas = pageCanvas();
    host.current!.replaceChildren(canvas);
    (async () => {
      lease = await leasePage(doc, index + 1);
      if (cancelled) return lease.release();
      const pg = lease.page;
      const rotation = (pg.rotate + rotate) % 360;
      const base = pg.getViewport({ scale: 1, rotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const fit = width / (fitBox ? Math.max(base.width, base.height) : base.width);
      const viewport = pg.getViewport({ scale: fit * dpr, rotation });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // Hidden until the night pass is done, so a white page doesn't flash first.
      if (night) canvas.style.visibility = "hidden";
      task = pg.render({ canvas, viewport, recordImages: night });
      await task.promise;
      if (night && !cancelled) {
        const coords = task.imageCoordinates ?? (pg as unknown as { imageCoordinates?: ArrayLike<number> }).imageCoordinates;
        await applyNight(canvas, coords, () => cancelled, solidRadius(fit * dpr));
      }
      canvas.style.visibility = "";
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
      lease?.release();
      canvas.width = canvas.height = 0;
      canvas.remove();
    };
  }, [near, doc, index, rotate, width, fitBox, night]);

  return <div className={className} ref={host} style={{ width, height }} />;
});
