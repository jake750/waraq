import { memo, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import PdfThumb from "../pdf/PdfThumb";

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
  return (
    <button className="thumb" data-thumb={page} aria-current={active ? "page" : undefined} onClick={() => onPick(page)}>
      <PdfThumb className={night ? "thumb-canvas night" : "thumb-canvas"} doc={doc} index={page - 1} width={THUMB_W} height={height} night={night} margin={300} />
      <span>{page}</span>
    </button>
  );
});
