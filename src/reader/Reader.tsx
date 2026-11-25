import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowRightLeft,
  BookOpen,
  ChevronsLeftRightEllipsis,
  File,
  Maximize,
  Minimize,
  Moon,
  SunMoon,
  Coffee,
  PenLine,
  PanelLeft,
  Proportions,
  Rows3,
  X,
  ZoomIn,
  ZoomOut, FileOutput, Share2 } from "lucide-react";
import { useT } from "../i18n";
import { useBack } from "../shell/back";
import { detectRtl } from "../text/arabic";
import { pageText, type Match } from "../text/search";
import { loadDocView, loadNightPrefs, saveDocView, saveNightPrefs, type PageTone } from "../prefs";
import type { NightOptions } from "./night";
import ToneMenu from "./ToneMenu";
import ShortcutsDialog from "./ShortcutsDialog";
import { rowScales, pageOffsets, spreadGroups, visiblePages, withPageSize, parsePageNumber, rowAt } from "./layout";
import PageView, { readingOrderSelection, type HighlightRect } from "./PageView";
import { setFullscreen } from "./fullscreen";
import "./reader.css";
import { ICON } from "../shell/icons";

export type ViewMode = "continuous" | "single" | "spread";
type Size = { w: number; h: number };

const GAP = 16;
// Space around the pages: phones keep only a thin margin so the page itself gets the width.
const PAD = typeof window !== "undefined" && window.innerWidth < 720 ? 10 : 24;
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
  panel?: (api: ReaderApi & { page: number; rtl: boolean; night: NightOptions | false }) => ReactNode;
  panelOpen?: boolean;
  onPanelToggle?(): void;
  onFind?(): void;
  /** Opens this document in the editor. */
  onEdit?(): void;
  /** Queues this document for conversion (to Word, images, text…). */
  onConvert?(): void;
  /** Hands the file to another app (Android). */
  onShare?(): void;
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
  // Zoom, view mode and direction come back the way this document was last read.
  const saved = useMemo(() => loadDocView(p.docKey), [p.docKey]);
  const [fit, setFit] = useState<"width" | "page" | null>(() => (saved.zoom ? null : (saved.fit ?? "width")));
  const [manualScale, setManualScale] = useState(() => saved.zoom ?? 1);
  const [view, setView] = useState<ViewMode>(() => saved.view ?? "continuous");
  const [rtl, setRtl] = useState(() => saved.rtl ?? false);
  // The direction is saved only once it is known (detected from the text or chosen by hand),
  // so detection never overwrites the reader's own choice.
  const rtlKnown = useRef(saved.rtl !== undefined);
  useEffect(
    () => saveDocView(p.docKey, { view, ...(rtlKnown.current ? { rtl } : {}), ...(fit ? { fit } : { zoom: manualScale }) }),
    [p.docKey, view, rtl, fit, manualScale],
  );
  // Page tone: plain, night (recoloured), sepia or "auto" (night while the app is dark), chosen
  // from the moon button's menu and kept across documents and restarts with the night look.
  const [nightPrefs, setNightPrefs] = useState(loadNightPrefs);
  const { tone, level, warm, sepiaLevel } = nightPrefs;
  const setNight = useCallback((change: Partial<typeof nightPrefs>) => setNightPrefs((v) => ({ ...v, ...change })), []);
  useEffect(() => saveNightPrefs(nightPrefs), [nightPrefs]);
  const appDark = useAppDark();
  const shown: Exclude<PageTone, "auto"> = tone === "auto" ? (appDark ? "night" : "day") : tone;
  // Night and sepia are both drawn into the canvas (night.ts); `night` carries whichever is shown.
  const night = useMemo<NightOptions | false>(
    () => (shown === "night" ? { level, warm } : shown === "sepia" ? { level: sepiaLevel, warm: false, sepia: true } : false),
    [shown, level, warm, sepiaLevel],
  );
  const toneClass = night ? (night.sepia ? " sepia" : " night") : "";
  const [toneMenu, setToneMenu] = useState(false);
  const toneLabel = tone === "auto" ? t.toneAuto : tone === "night" ? t.night : tone === "sepia" ? t.sepia : t.toneDay;
  const [full, setFull] = useState(false);
  const [keysHelp, setKeysHelp] = useState(false);
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
    }).catch(() => {});
    // Reading direction from the first pages' text.
    (async () => {
      let sample = "";
      for (let i = 0; i < Math.min(3, n); i++) sample += await pageText(doc, i);
      if (alive && !rtlKnown.current) {
        rtlKnown.current = true;
        setRtl(detectRtl(sample));
      }
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

  // Pages report their real size once loaded (a landscape table inside a portrait book).
  const onPageSize = useCallback((pg: number, w: number, h: number) => {
    setSizes((s) => (s ? withPageSize(s, pg - 1, { w, h }) : s));
  }, []);

  const rows = useMemo(() => {
    if (view === "spread") return spreadGroups(n, true);
    return Array.from({ length: n }, (_, i) => [i + 1]);
  }, [view, n]);

  // Each row fits on its own, so a wide page among narrow ones still fills the width.
  const scales = useMemo(
    () =>
      sizes
        ? rowScales(rows, sizes, fit, manualScale, { w: box.w - PAD * 2, h: box.h - PAD * 2 }, GAP, view === "spread" ? 2 : 1)
        : rows.map(() => 1),
    [rows, sizes, fit, manualScale, box, view],
  );

  const rowHeights = useMemo(
    () => (sizes ? rows.map((r, i) => Math.max(...r.map((pg) => sizes[pg - 1].h * scales[i]))) : []),
    [rows, sizes, scales],
  );
  const tops = useMemo(() => pageOffsets(rowHeights, GAP), [rowHeights]);
  const total = rowHeights.length ? tops[tops.length - 1] + rowHeights[rowHeights.length - 1] : 0;
  const rowOf = useCallback((page: number) => rows.findIndex((r) => r.includes(page)), [rows]);
  const scale = scales[Math.max(0, rowOf(current))] ?? 1;

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
  /** A finished pinch/wheel zoom: keep the point under the fingers or cursor where it was. */
  const focal = useRef<{ row: number; frac: number; page?: string; fx: number; vx: number; vy: number } | null>(null);
  const focused = useRef(false);
  useLayoutEffect(() => {
    const g = focal.current;
    const el = scroller.current;
    if (!g || !el) return;
    focal.current = null;
    focused.current = true;
    if (pagesEl.current) pagesEl.current.style.transform = "";
    const top = (view === "single" ? 0 : (tops[g.row] ?? 0)) + PAD + g.frac * (rowHeights[g.row] ?? 0);
    el.scrollTop = top - g.vy;
    const page = g.page ? el.querySelector<HTMLElement>(`.page[data-page="${g.page}"]`) : null;
    if (page) {
      const b = page.getBoundingClientRect();
      el.scrollLeft += b.left - el.getBoundingClientRect().left + g.fx * b.width - g.vx;
    }
  }, [scales, tops, rowHeights, view]);
  useEffect(() => {
    if (focused.current) {
      focused.current = false;
      return;
    }
    if (placed.current) goTo(anchor.current);
    // The box matters only when fitting: at a manual zoom a scrollbar appearing must not jump the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, manualScale, fit && box.w, fit && box.h, view]);

  useEffect(() => {
    if (p.focus) goTo(p.focus.page + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus]);

  // Scrolling re-renders the reader only when the set of mounted rows changes, not every frame.
  const shownKey = useRef("");
  const onScroll = () => {
    const el = scroller.current!;
    const key = visiblePages(Math.max(0, el.scrollTop - PAD), box.h, rowHeights, GAP, 2, tops).join();
    if (key !== shownKey.current) setScrollTop(el.scrollTop);
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

  // Read through a ref: a parent re-rendering (a conversion's progress) must not restart the debounce.
  const latest = useRef({ current, onPageChange: p.onPageChange });
  latest.current = { current, onPageChange: p.onPageChange };
  useEffect(() => {
    const id = setTimeout(() => latest.current.onPageChange(current), 500);
    return () => clearTimeout(id);
  }, [current]);
  // Leaving the reader inside the debounce window still saves the page.
  useEffect(() => () => latest.current.onPageChange(latest.current.current), []);

  // Live zoom: while a gesture runs only a CSS transform changes (no React render, no page
  // re-layout, no canvas work); the real zoom is applied once, when the gesture ends.
  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  const live = useRef<{ f: number; ox: number; oy: number; vx: number; vy: number } | null>(null);
  const liveZoom = useCallback(
    (f: number, vx: number, vy: number) => {
      const el = scroller.current;
      const pages = pagesEl.current;
      if (!el || !pages) return;
      let g = live.current;
      if (!g) g = live.current = { f: 1, ox: el.scrollLeft + vx, oy: el.scrollTop + vy, vx, vy };
      g.f = clampScale(scale * g.f * f) / scale;
      pages.style.transformOrigin = `${g.ox}px ${g.oy}px`;
      pages.style.transform = `scale(${g.f})`;
    },
    [scale],
  );
  const commitZoom = useCallback(() => {
    const g = live.current;
    live.current = null;
    if (!g) return;
    if (Math.abs(g.f - 1) < 0.01) {
      if (pagesEl.current) pagesEl.current.style.transform = "";
      return;
    }
    const y = g.oy - PAD;
    const at = view === "single" ? { row: rowOf(current), frac: y / (rowHeights[rowOf(current)] || 1) } : rowAt(y, tops, rowHeights);
    // The page under the focal point and how far across it, measured while still transformed.
    const el = scroller.current!;
    const sr = el.getBoundingClientRect();
    const hit = document.elementsFromPoint(sr.left + g.vx, sr.top + g.vy).find((e) => e.classList.contains("page")) as HTMLElement | undefined;
    const hb = hit?.getBoundingClientRect();
    const fx = hb && hb.width ? (sr.left + g.vx - hb.left) / hb.width : 0.5;
    focal.current = { ...at, page: hit?.dataset.page, fx, vx: g.vx, vy: g.vy };
    setManualScale(clampScale(scale * g.f));
    setFit(null);
  }, [scale, view, rowOf, current, rowHeights, tops]);

  /** Buttons and keys: zoom around the middle of the view. */
  const zoomBy = useCallback(
    (f: number) => {
      const el = scroller.current;
      if (!el || !pagesEl.current) {
        setManualScale(clampScale(scale * f));
        setFit(null);
        return;
      }
      liveZoom(f, el.clientWidth / 2, el.clientHeight / 2);
      commitZoom();
    },
    [scale, liveZoom, commitZoom],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const r = rowOf(current) + dir;
      if (r >= 0 && r < rows.length) goTo(rows[r][0]);
    },
    [rowOf, current, rows, goTo],
  );

  // Full screen follows `full`; always leave it when the reader closes.
  useEffect(() => {
    void setFullscreen(full);
  }, [full]);
  useEffect(() => () => void setFullscreen(false), []);
  useBack(full, () => setFull(false));
  // The browser's own exit (Esc in a browser, the Android back gesture) turns it off here too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && !("__TAURI_INTERNALS__" in window)) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keyboard (desktop). Arrow keys follow the reading direction.
  const { onFind, onClose } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      if (keysHelp) return; // the dialog handles its own keys
      // Settings, a password or another dialog on top owns the keyboard (one Escape closes only it).
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "?") setKeysHelp(true);
      else if (mod && (e.key === "+" || e.key === "=")) zoomBy(ZOOM_STEP);
      else if (mod && e.key === "-") zoomBy(1 / ZOOM_STEP);
      else if (mod && e.key === "0") setFit("width");
      else if (mod && e.key.toLowerCase() === "f") onFind?.();
      else if (e.key === "ArrowRight") step(rtl ? -1 : 1);
      else if (e.key === "ArrowLeft") step(rtl ? 1 : -1);
      else if (e.key === "Home") goTo(1);
      else if (e.key === "End") goTo(n);
      else if (view === "single" && e.key === "PageDown") step(1);
      else if (view === "single" && e.key === "PageUp") step(-1);
      else if (e.key === "F11") setFull((f) => !f);
      // N (by key position, so it works on an Arabic layout too): night pages on and off.
      else if (!mod && !e.altKey && e.code === "KeyN") setNight({ tone: shown === "night" ? "day" : "night" });
      else if (e.key === "Escape") {
        if (full) setFull(false);
        else onClose();
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, step, rtl, goTo, n, view, onFind, onClose, full, keysHelp, shown, setNight]);

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
  // The wheel zoom ends once the wheel/touchpad has been quiet this long.
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const el = scroller.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // A touchpad pinch sends many small deltas, a mouse wheel few big ones.
      liveZoom(Math.min(1.25, Math.max(1 / 1.25, Math.exp(-e.deltaY * 0.01))), e.clientX - r.left, e.clientY - r.top);
      clearTimeout(settle.current);
      settle.current = setTimeout(commitZoom, 180);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [liveZoom, commitZoom]);
  useEffect(() => () => clearTimeout(settle.current), []);

  // Two-finger pinch on touch screens: live CSS scale around the fingers, real zoom on release.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ last: number } | null>(null);
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { last: dist() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const d = dist();
      if (!d || !pinch.current.last) return;
      const [a, b] = [...pointers.current.values()];
      const r = scroller.current!.getBoundingClientRect();
      liveZoom(d / pinch.current.last, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current.last = d;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current && pointers.current.size < 2) {
      pinch.current = null;
      commitZoom();
    }
  };

  const shownRows =
    view === "single"
      ? [rowOf(current)]
      : sizes
        ? visiblePages(Math.max(0, scrollTop - PAD), box.h, rowHeights, GAP, 2, tops)
        : [];
  shownKey.current = shownRows.join();

  const submitPage = () => {
    const v = parsePageNumber(pageInput);
    if (Number.isFinite(v)) goTo(v);
    else setPageInput(String(current));
  };

  const views: [ViewMode, ReactNode, string][] = [
    ["continuous", <Rows3 size={ICON.md} />, t.viewContinuous],
    ["single", <File size={ICON.md} />, t.viewSingle],
    ["spread", <BookOpen size={ICON.md} />, t.viewSpread],
  ];

  const api = { goTo, page: current, rtl, night };
  const closeToneMenu = useCallback(() => setToneMenu(false), []);

  return (
    <div className={full ? "reader full" : "reader"}>
      {keysHelp && <ShortcutsDialog onClose={() => setKeysHelp(false)} />}
      {full && (
        <button className="icon-btn reader-unfull" onClick={() => setFull(false)} title={`${t.exitFullscreen} (Esc)`} aria-label={t.exitFullscreen}>
          <Minimize size={ICON.md} />
        </button>
      )}
      <header className="reader-bar">
        {/* How far through the document you are: a hairline along the bar. */}
        {n > 1 && <span className="reader-progress" style={{ width: `${(current / n) * 100}%` }} aria-hidden />}
        <button className="icon-btn" onClick={p.onClose} title={t.close} aria-label={t.close}>
          <X size={ICON.md} />
        </button>
        {p.panel && (
          <button
            className="icon-btn"
            onClick={p.onPanelToggle}
            aria-pressed={!!p.panelOpen}
            title={t.panel}
            aria-label={t.panel}
          >
            <PanelLeft size={ICON.md} className="flip-rtl" />
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
            onChange={(e) => setPageInput(e.target.value.replace(/[^\d٠-٩۰-۹]/g, ""))}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === "Enter" && submitPage()}
            onBlur={submitPage}
            style={{ width: `${Math.max(2, String(n).length) + 1.5}ch` }}
          />
          <span>{t.pageOf(n)}</span>
        </div>
        <div className="reader-tools">
          <button className="icon-btn zoom-ctl" onClick={() => zoomBy(1 / ZOOM_STEP)} title={t.zoomOut} aria-label={t.zoomOut}>
            <ZoomOut size={ICON.md} />
          </button>
          <span className="zoom-value zoom-ctl">{Math.round(scale * 100)}%</span>
          <button className="icon-btn zoom-ctl" onClick={() => zoomBy(ZOOM_STEP)} title={t.zoomIn} aria-label={t.zoomIn}>
            <ZoomIn size={ICON.md} />
          </button>
          <button
            className="icon-btn desk-only"
            aria-pressed={fit === "width"}
            onClick={() => setFit("width")}
            title={t.fitWidth}
            aria-label={t.fitWidth}
          >
            <ChevronsLeftRightEllipsis size={ICON.md} />
          </button>
          <button
            className="icon-btn desk-only"
            aria-pressed={fit === "page"}
            onClick={() => setFit("page")}
            title={t.fitPage}
            aria-label={t.fitPage}
          >
            <Proportions size={ICON.md} />
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
            className="icon-btn desk-only"
            aria-pressed={rtl}
            onClick={() => {
              rtlKnown.current = true;
              setRtl(!rtl);
            }}
            title={`${t.direction}: ${rtl ? t.dirRtl : t.dirLtr}`}
            aria-label={`${t.direction}: ${rtl ? t.dirRtl : t.dirLtr}`}
          >
            <ArrowRightLeft size={ICON.md} />
          </button>
          <div className="tone-wrap">
            <button
              className="icon-btn"
              aria-pressed={tone !== "day"}
              aria-haspopup="menu"
              aria-expanded={toneMenu}
              onClick={() => setToneMenu((o) => !o)}
              title={`${t.pageTone}: ${toneLabel} (N)`}
              aria-label={`${t.pageTone}: ${toneLabel}`}
            >
              {tone === "sepia" ? <Coffee size={ICON.md} /> : tone === "auto" ? <SunMoon size={ICON.md} /> : <Moon size={ICON.md} />}
            </button>
            {toneMenu && (
              <ToneMenu
                tone={tone}
                level={level}
                warm={warm}
                sepiaLevel={sepiaLevel}
                onSepiaLevel={(v) => setNight({ sepiaLevel: v })}
                onTone={(v) => setNight({ tone: v })}
                onLevel={(v) => setNight({ level: v })}
                onWarm={(v) => setNight({ warm: v })}
                onClose={closeToneMenu}
              />
            )}
          </div>
          <button
            className="icon-btn"
            onClick={() => setFull(true)}
            title={`${t.fullscreen} (F11)`}
            aria-label={t.fullscreen}
          >
            <Maximize size={ICON.md} />
          </button>
          {p.onShare && (
            <button className="icon-btn" onClick={p.onShare} title={t.share} aria-label={t.share}>
              <Share2 size={ICON.md} />
            </button>
          )}
          {p.onConvert && (
            <button className="icon-btn" onClick={p.onConvert} title={t.convertThis} aria-label={t.convertThis}>
              <FileOutput size={ICON.md} />
            </button>
          )}
          {p.onEdit && (
            <button className="btn btn-ghost btn-sm reader-edit" onClick={p.onEdit} title={t.edit} aria-label={t.edit}>
              <PenLine size={ICON.sm} />
              <span>{t.edit}</span>
            </button>
          )}
        </div>
      </header>

      <div className="reader-body">
        {p.panel && p.panelOpen && <aside className="reader-panel">{p.panel(api)}</aside>}
        <div
          ref={scroller}
          className={`reader-scroll${toneClass}`}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // Arrow keys belong to page navigation; the scroller itself still scrolls with wheel/touch.
          tabIndex={-1}
        >
          {!sizes && (
            <div className="reader-loading" role="status" aria-label={t.loading}>
              <div className="page-skeleton" />
            </div>
          )}
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
                        scale={scales[r]}
                        night={night}
                        width={sizes[pg - 1].w * scales[r]}
                        height={sizes[pg - 1].h * scales[r]}
                        highlights={p.highlights?.get(pg) ?? NO_HIGHLIGHTS}
                        onSize={onPageSize}
                        onGoTo={goTo}
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

/** Whether the app is in its dark theme right now (App.tsx sets `data-theme` on the root). */
function useAppDark(): boolean {
  const read = () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
