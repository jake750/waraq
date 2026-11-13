import { pageCanvas } from "../pdf/pageCanvas";
import { leasePage, type PageLease } from "./pageLease";
import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const THUMB_W = 132;

type Props = { doc: PDFDocumentProxy; ratio: number; current: number; onPick(page: number): void };

/** Page thumbnails; each renders only while near the visible part of the list. */
export default function Thumbnails({ doc, ratio, current, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-thumb="${current}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);
  return (
    <div className="thumbs" ref={listRef}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <Thumb key={i} doc={doc} page={i + 1} height={THUMB_W * ratio} active={current === i + 1} onPick={onPick} />
      ))}
    </div>
  );
}

const Thumb = memo(function Thumb({
  doc,
  page,
  height,
  active,
  onPick,
}: {
  doc: PDFDocumentProxy;
  page: number;
  height: number;
  active: boolean;
  onPick(page: number): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    let lease: PageLease | undefined;
    const canvas = pageCanvas();
    host.current!.replaceChildren(canvas);
    (async () => {
      lease = await leasePage(doc, page);
      if (cancelled) return lease.release();
      const pg = lease.page;
      const base = pg.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pg.getViewport({ scale: (THUMB_W / base.width) * ratio });
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
  }, [near, doc, page]);

  return (
    <button
      ref={ref}
      className="thumb"
      data-thumb={page}
      aria-current={active ? "page" : undefined}
      onClick={() => onPick(page)}
    >
      <div ref={host} className="thumb-canvas" style={{ width: THUMB_W, height }} />
      <span>{page}</span>
    </button>
  );
});
