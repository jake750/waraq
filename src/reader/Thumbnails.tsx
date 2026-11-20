import { pageCanvas } from "../pdf/pageCanvas";
import { leasePage, type PageLease } from "./pageLease";
import { applyNight, solidRadius } from "./night";
import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

// Larger thumbnails (and a wider panel, in reader.css) on big screens.
const WIDE = typeof window !== "undefined" && window.innerWidth >= 1400;
const THUMB_W = WIDE ? 168 : 132;

type Props = { doc: PDFDocumentProxy; ratio: number; current: number; night?: boolean; onPick(page: number): void };

/** Page thumbnails; each renders only while near the visible part of the list. */
export default function Thumbnails({ doc, ratio, current, night = false, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-thumb="${current}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);
  return (
    <div className="thumbs" ref={listRef}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <Thumb key={i} doc={doc} page={i + 1} height={THUMB_W * ratio} active={current === i + 1} night={night} onPick={onPick} />
      ))}
    </div>
  );
}

const Thumb = memo(function Thumb({
  doc,
  page,
  height,
  active,
  night,
  onPick,
}: {
  doc: PDFDocumentProxy;
  page: number;
  height: number;
  active: boolean;
  night: boolean;
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
      const scale = (THUMB_W / base.width) * ratio;
      // Hidden until the night pass is done, so a white page doesn't flash first.
      if (night) canvas.style.visibility = "hidden";
      task = pg.render({ canvas, viewport, recordImages: night });
      await task.promise;
      if (night && !cancelled) {
        const coords = task.imageCoordinates ?? (pg as unknown as { imageCoordinates?: ArrayLike<number> }).imageCoordinates;
        await applyNight(canvas, coords, () => cancelled, solidRadius(scale));
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
  }, [near, doc, page, night]);

  return (
    <button
      ref={ref}
      className="thumb"
      data-thumb={page}
      aria-current={active ? "page" : undefined}
      onClick={() => onPick(page)}
    >
      <div ref={host} className={night ? "thumb-canvas night" : "thumb-canvas"} style={{ width: THUMB_W, height }} />
      <span>{page}</span>
    </button>
  );
});
