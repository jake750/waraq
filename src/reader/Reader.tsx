import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowRightLeft,
  BookOpen,
  ChevronsLeftRightEllipsis,
  File,
  Maximize,
  Moon,
  PanelLeft,
  Rows3,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useT } from "../i18n";
import { detectRtl } from "../text/arabic";
import { pageText, type Match } from "../text/search";
import { fitScale, pageOffsets, spreadGroups, visiblePages } from "./layout";
import PageView, { readingOrderSelection, type HighlightRect } from "./PageView";
import "./reader.css";

export type ViewMode = "continuous" | "single" | "spread";
type Size = { w: number; h: number };

const GAP = 16;
const PAD = 24;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.2;

export type ReaderApi = { goTo(page: number): void };

type Props = {
  doc: PDFDocumentProxy;
  docKey: string;
  name: string;
  initialPage?: number;
  onPageChange(page: number): void;
  onClose(): void;
  /** Side panel content (thumbnails, outline, search); receives the reader API. */
  panel?: (api: ReaderApi & { page: number; rtl: boolean }) => ReactNode;
  panelOpen?: boolean;
  onPanelToggle?(): void;
  onFind?(): void;
  /** Highlight rectangles per 1-based page. */
  highlights?: Map<number, HighlightRect[]>;
  /** Page to jump to when it changes (e.g. current search match). */
  focus?: Match | null;
};

export default function Reader(p: Props) {
  const t = useT();
  const { doc } = p;
  const n = doc.numPages;
  const scroller = useRef<HTMLDivElement>(null);
  const pagesEl = useRef<HTMLDivElement>(null);

  const [box, setBox] = useState<Size>({ w: 800, h: 600 });
  const [sizes, setSizes] = useState<Size[] | null>(null);
  const [fit, setFit] = useState<"width" | "page" | null>("width");
  const [manualScale, setManualScale] = useState(1);
  const [view, setView] = useState<ViewMode>("continuous");
  const [rtl, setRtl] = useState(false);
  const [night, setNight] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [current, setCurrent] = useState(Math.min(Math.max(p.initialPage ?? 1, 1), n));
  const [pageInput, setPageInput] = useState(String(current));

  // Page sizes at scale 1: assume page 1's size everywhere, correct pages as they load.
  useEffect(() => {
    let alive = true;
    doc.getPage(1).then((pg) => {
      if (!alive) return;
      const v = pg.getViewport({ scale: 1 });
      setSizes(Array.from({ length: n }, () => ({ w: v.width, h: v.height })));
    });
    // Reading direction from the first pages' text.
    (async () => {
      let sample = "";
      for (let i = 0; i < Math.min(3, n); i++) sample += await pageText(doc, i);
      if (alive) setRtl(detectRtl(sample));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [doc, n]);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    if (view === "spread") return spreadGroups(n, true);
    return Array.from({ length: n }, (_, i) => [i + 1]);
  }, [view, n]);

  const scale = useMemo(() => {
    if (!sizes) return 1;
    if (!fit) return manualScale;
    const first = sizes[0];
    const perRow = view === "spread" ? 2 : 1;
    const avail = { w: Math.max(100, box.w - PAD * 2 - (perRow - 1) * GAP), h: Math.max(100, box.h - PAD * 2) };
    return fitScale(fit, { w: first.w * perRow, h: first.h }, avail);
  }, [sizes, fit, manualScale, box, view]);

  const rowHeights = useMemo(
    () => (sizes ? rows.map((r) => Math.max(...r.map((pg) => sizes[pg - 1].h * scale))) : []),
    [rows, sizes, scale],
  );
  const tops = useMemo(() => pageOffsets(rowHeights, GAP), [rowHeights]);
  const total = rowHeights.length ? tops[tops.length - 1] + rowHeights[rowHeights.length - 1] : 0;
  const rowOf = useCallback((page: number) => rows.findIndex((r) => r.includes(page)), [rows]);

  const goTo = useCallback(
    (page: number) => {
      const pg = Math.min(Math.max(1, Math.round(page)), n);
      setCurrent(pg);
      setPageInput(String(pg));
      const el = scroller.current;
      if (el && view !== "single") el.scrollTop = (tops[rowOf(pg)] ?? 0) + PAD - 8;
      else if (el) el.scrollTop = 0;
    },
    [n, tops, rowOf, view],
  );

  // Jump to the initial page once the layout exists.
  const placed = useRef(false);
  useEffect(() => {
    if (!placed.current && sizes) {
      placed.current = true;
      requestAnimationFrame(() => goTo(current));
    }
  }, [sizes, goTo, current]);

  // Keep the same page in view when the scale or view mode changes.
  const anchor = useRef(current);
  anchor.current = current;
  useEffect(() => {
    if (placed.current) goTo(anchor.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, view]);

  useEffect(() => {
    if (p.focus) goTo(p.focus.page + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus]);

  const onScroll = () => {
    const el = scroller.current!;
    setScrollTop(el.scrollTop);
    if (view === "single") return;
    const probe = el.scrollTop + el.clientHeight * 0.35 - PAD;
    let r = 0;
    while (r + 1 < tops.length && tops[r + 1] <= probe) r++;
    const pg = rows[r]?.[0] ?? 1;
    if (pg !== current) {
      setCurrent(pg);
      setPageInput(String(pg));
    }
  };

  const { onPageChange } = p;
  useEffect(() => {
    const id = setTimeout(() => onPageChange(current), 500);
    return () => clearTimeout(id);
  }, [current, onPageChange]);

  const zoomBy = useCallback(
    (f: number) => {
      setManualScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * f)));
      setFit(null);
    },
    [scale],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const r = rowOf(current) + dir;
      if (r >= 0 && r < rows.length) goTo(rows[r][0]);
    },
    [rowOf, current, rows, goTo],
  );

  // Keyboard (desktop). Arrow keys follow the reading direction.
  const { onFind, onClose } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "+" || e.key === "=")) zoomBy(ZOOM_STEP);
      else if (mod && e.key === "-") zoomBy(1 / ZOOM_STEP);
      else if (mod && e.key === "0") setFit("width");
      else if (mod && e.key.toLowerCase() === "f") onFind?.();
      else if (e.key === "ArrowRight") step(rtl ? -1 : 1);
      else if (e.key === "ArrowLeft") step(rtl ? 1 : -1);
      else if (e.key === "Home") goTo(1);
      else if (e.key === "End") goTo(n);
      else if (view === "single" && e.key === "PageDown") step(1);
      else if (view === "single" && e.key === "PageUp") step(-1);
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, step, rtl, goTo, n, view, onFind, onClose]);

  // Copy Arabic selections in reading order.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const sel = document.getSelection();
      const text = sel && readingOrderSelection(sel);
      if (text && e.clipboardData) {
        e.clipboardData.setData("text/plain", text);
        e.preventDefault();
      }
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);

  // Ctrl+wheel (and trackpad pinch) zoom on desktop.
  useEffect(() => {
    const el = scroller.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Two-finger pinch on touch screens: live CSS scale, real re-render on release.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ start: number; ratio: number } | null>(null);
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { start: dist(), ratio: 1 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      pinch.current.ratio = dist() / pinch.current.start;
      if (pagesEl.current) pagesEl.current.style.transform = `scale(${pinch.current.ratio})`;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current && pointers.current.size < 2) {
      const r = pinch.current.ratio;
      pinch.current = null;
      if (pagesEl.current) pagesEl.current.style.transform = "";
      if (Math.abs(r - 1) > 0.02) zoomBy(r);
    }
  };

  const shownRows =
    view === "single"
      ? [rowOf(current)]
      : sizes
        ? visiblePages(Math.max(0, scrollTop - PAD), box.h, rowHeights, GAP, 2)
        : [];

  const submitPage = () => {
    const v = parseInt(pageInput, 10);
    if (Number.isFinite(v)) goTo(v);
    else setPageInput(String(current));
  };

  const views: [ViewMode, ReactNode, string][] = [
    ["continuous", <Rows3 size={18} />, t.viewContinuous],
    ["single", <File size={18} />, t.viewSingle],
    ["spread", <BookOpen size={18} />, t.viewSpread],
  ];

  const api = { goTo, page: current, rtl };

  return (
    <div className="reader">
      <header className="reader-bar">
        <button className="icon-btn" onClick={p.onClose} title={t.close} aria-label={t.close}>
          <X size={20} />
        </button>
        {p.panel && (
          <button
            className="icon-btn"
            onClick={p.onPanelToggle}
            aria-pressed={!!p.panelOpen}
            title={t.panel}
            aria-label={t.panel}
          >
            <PanelLeft size={19} />
          </button>
        )}
        <span className="reader-name" title={p.name}>
          {p.name}
        </span>
        <div className="reader-page">
          <input
            value={pageInput}
            inputMode="numeric"
            aria-label={t.goToPage}
            onChange={(e) => setPageInput(e.target.value.replace(/[^\d٠-٩]/g, ""))}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === "Enter" && submitPage()}
            onBlur={submitPage}
            style={{ width: `${Math.max(2, String(n).length) + 1.5}ch` }}
          />
          <span>{t.pageOf(n)}</span>
        </div>
        <div className="reader-tools">
          <button className="icon-btn" onClick={() => zoomBy(1 / ZOOM_STEP)} title={t.zoomOut} aria-label={t.zoomOut}>
            <ZoomOut size={19} />
          </button>
          <span className="zoom-value">{Math.round(scale * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomBy(ZOOM_STEP)} title={t.zoomIn} aria-label={t.zoomIn}>
            <ZoomIn size={19} />
          </button>
          <button
            className="icon-btn"
            aria-pressed={fit === "width"}
            onClick={() => setFit("width")}
            title={t.fitWidth}
            aria-label={t.fitWidth}
          >
            <ChevronsLeftRightEllipsis size={19} />
          </button>
          <button
            className="icon-btn"
            aria-pressed={fit === "page"}
            onClick={() => setFit("page")}
            title={t.fitPage}
            aria-label={t.fitPage}
          >
            <Maximize size={18} />
          </button>
          <span className="bar-sep" />
          <div className="view-switch" role="group" aria-label={t.viewMode}>
            {views.map(([v, icon, label]) => (
              <button
                key={v}
                className="icon-btn"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                title={label}
                aria-label={label}
              >
                {icon}
              </button>
            ))}
          </div>
          <button
            className="icon-btn"
            aria-pressed={rtl}
            onClick={() => setRtl(!rtl)}
            title={`${t.direction}: ${rtl ? t.dirRtl : t.dirLtr}`}
            aria-label={`${t.direction}: ${rtl ? t.dirRtl : t.dirLtr}`}
          >
            <ArrowRightLeft size={18} />
          </button>
          <button
            className="icon-btn"
            aria-pressed={night}
            onClick={() => setNight(!night)}
            title={t.night}
            aria-label={t.night}
          >
            <Moon size={18} />
          </button>
        </div>
      </header>

      <div className="reader-body">
        {p.panel && p.panelOpen && <aside className="reader-panel">{p.panel(api)}</aside>}
        <div
          ref={scroller}
          className="reader-scroll"
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // Arrow keys belong to page navigation; the scroller itself still scrolls with wheel/touch.
          tabIndex={-1}
        >
          {!sizes && <div className="reader-loading">{t.loading}</div>}
          {sizes && (
            <div
              ref={pagesEl}
              className="pages"
              style={{
                height: view === "single" ? (rowHeights[rowOf(current)] ?? 0) + PAD * 2 : total + PAD * 2,
              }}
            >
              {shownRows.map((r) => {
                const row = rows[r];
                if (!row) return null;
                return (
                  <div
                    key={row.join("-")}
                    className="page-row"
                    style={{
                      top: (view === "single" ? 0 : tops[r]) + PAD,
                      height: rowHeights[r],
                      flexDirection: rtl ? "row-reverse" : "row",
                    }}
                  >
                    {row.map((pg) => (
                      <PageView
                        key={pg}
                        doc={doc}
                        pageNumber={pg}
                        scale={scale}
                        night={night}
                        width={sizes[pg - 1].w * scale}
                        height={sizes[pg - 1].h * scale}
                        highlights={p.highlights?.get(pg) ?? NO_HIGHLIGHTS}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const NO_HIGHLIGHTS: HighlightRect[] = [];
