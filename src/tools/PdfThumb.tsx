import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { leasePage, type PageLease } from "../reader/pageLease";

type Props = { doc: PDFDocumentProxy; index: number; rotate: number; width: number };

/** One page rendered small, only while near the screen. `rotate` is added to the page's own rotation. */
export default memo(function PdfThumb({ doc, index, rotate, width }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "400px 0px" });
    io.observe(host.current!);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    let lease: PageLease | undefined;
    const canvas = document.createElement("canvas");
    host.current!.replaceChildren(canvas);
    (async () => {
      lease = await leasePage(doc, index + 1);
      if (cancelled) return lease.release();
      const pg = lease.page;
      const rotation = (pg.rotate + rotate) % 360;
      const base = pg.getViewport({ scale: 1, rotation });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pg.getViewport({ scale: (width / Math.max(base.width, base.height)) * ratio, rotation });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = pg.render({ canvas, viewport });
      await task.promise;
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
      lease?.release();
      canvas.width = canvas.height = 0;
      canvas.remove();
    };
  }, [near, doc, index, rotate, width]);

  return <div className="pthumb" ref={host} style={{ width, height: width }} />;
});
