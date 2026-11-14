import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import PageView from "../reader/PageView";
import { useT } from "../i18n";
import type { PageLayout } from "../text/search";
import { css, newId, type Mark, type Pt, type Rect, type Rgb } from "./marks";
import { hasText, markBounds, moveMark, scalePaths, selectText, simplify, spanRect, svgStroke } from "./geometry";

export type Tool = "select" | "highlight" | "underline" | "strike" | "ink" | "rect" | "ellipse" | "line" | "arrow" | "text" | "note";
export const TEXT_TOOLS: Tool[] = ["highlight", "underline", "strike"];
const SHAPES: Tool[] = ["rect", "ellipse", "line", "arrow"];

type Props = {
  doc: PDFDocumentProxy;
  index: number;
  /** Page size at scale 1 (rotation applied). */
  size: { w: number; h: number };
  scale: number;
  marks: Mark[];
  tool: Tool;
  color: Rgb;
  stroke: number;
  textSize: number;
  selected: string | null;
  editing: string | null;
  layout(index: number): Promise<PageLayout>;
  onAdd(m: Mark): void;
  onUpdate(id: string, patch: Partial<Mark>): void;
  onRemove(id: string): void;
  onSelect(id: string | null): void;
  onEdit(id: string | null): void;
  /** Form answers typed in the panel, shown over their fields until saved. */
  answers?: { name: string; rect: Rect; text: string }[];
  onField?(name: string): void;
};

type Draft =
  | { kind: "sel"; rects: Rect[]; text: string }
  | { kind: "ink"; pts: Pt[] }
  | { kind: "shape"; a: Pt; b: Pt }
  /** A mark being moved or reshaped, as it will be when the pointer is let go. */
  | { kind: "live"; id: string; mark: Mark };

/** A handle on a selected mark: a corner of its box (0..3, see `corners`), an end of a line, or a text box's side. */
type Handle = { corner: number } | { end: "a" | "b" } | { side: true };

const corners = (r: Rect): Pt[] => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
];
const MIN_SIZE = 4;

/** `r` with corner `k` dragged to `at`, the opposite corner fixed; `keep` keeps the aspect (and never flips). */
function stretch(r: Rect, k: number, at: Pt, keep: boolean): Rect {
  const c = corners(r);
  const o = c[(k + 2) % 4];
  const sx = Math.sign(c[k][0] - o[0]) || 1;
  const sy = Math.sign(c[k][1] - o[1]) || 1;
  let dx = at[0] - o[0];
  let dy = at[1] - o[1];
  if (keep && r.w && r.h) {
    const s = Math.max(MIN_SIZE / Math.min(r.w, r.h), Math.max((dx * sx) / r.w, (dy * sy) / r.h));
    dx = sx * r.w * s;
    dy = sy * r.h * s;
  } else {
    if (Math.abs(dx) < MIN_SIZE) dx = (Math.sign(dx) || sx) * MIN_SIZE;
    if (Math.abs(dy) < MIN_SIZE) dy = (Math.sign(dy) || sy) * MIN_SIZE;
  }
  return spanRect(o, [o[0] + dx, o[1] + dy]);
}

const coarse = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;

/** One page in the editor: the rendered page with its marks drawn over it, and the pointer tools. */
export default function EditorPage(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** `area`: a page without text (a scan): text tools mark the dragged rectangle instead. */
  const gesture = useRef<{
    start: Pt;
    screen: Pt;
    layout?: PageLayout;
    area?: boolean;
    /** Resolves once `layout`/`area` are known. */
    ready?: Promise<void>;
    last?: Pt;
    pts?: Pt[];
  } | null>(null);
  const w = p.size.w * p.scale;
  const h = p.size.h * p.scale;

  // Only pages near the screen are rendered.
  useEffect(() => {
    const el = host.current!;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // With a text tool in hand, read the text of the pages on screen ahead of the first drag.
  const textTool = TEXT_TOOLS.includes(p.tool);
  const { layout, index } = p;
  useEffect(() => {
    if (textTool && visible) layout(index).catch(() => {});
  }, [textTool, visible, layout, index]);

  useEffect(() => {
    let alive = true;
    p.doc
      .getPage(p.index + 1)
      .then((pg) => alive && setPage(pg))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p.doc, p.index]);
  // Derived in the same render as the new size: marks never lag a frame behind a zoom.
  const vp: PageViewport | null = useMemo(() => page?.getViewport({ scale: p.scale }) ?? null, [page, p.scale]);

  // One object URL per image, kept while the image is on the page (re-creating them on every
  // change made images flicker while other marks were edited).
  const urlCache = useRef(new Map<Uint8Array, string>());
  const urls = useMemo(() => {
    const cache = urlCache.current;
    const live = new Set<Uint8Array>();
    const m = new Map<string, string>();
    for (const k of p.marks) {
      if (k.kind !== "image") continue;
      live.add(k.bytes);
      let u = cache.get(k.bytes);
      if (!u) cache.set(k.bytes, (u = URL.createObjectURL(new Blob([k.bytes as BlobPart], { type: k.fmt === "png" ? "image/png" : "image/jpeg" }))));
      m.set(k.id, u);
    }
    for (const [bytes, u] of cache)
      if (!live.has(bytes)) {
        URL.revokeObjectURL(u);
        cache.delete(bytes);
      }
    return m;
  }, [p.marks]);
  useEffect(() => {
    const cache = urlCache.current;
    return () => {
      cache.forEach((u) => URL.revokeObjectURL(u));
      cache.clear();
    };
  }, []);

  const toView = (q: Pt): Pt => (vp ? (vp.convertToViewportPoint(q[0], q[1]) as Pt) : [0, 0]);
  const toPdf = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.current!.getBoundingClientRect();
    return vp ? (vp.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top) as Pt) : [0, 0];
  };
  const screenBox = (pts: Pt[]) => {
    const v = pts.map(toView);
    const xs = v.map((q) => q[0]);
    const ys = v.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const rectPts = (r: Rect): Pt[] => [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];

  // ---- pointer tools on the empty page ----
  const down = async (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !vp) return;
    if (p.editing) {
      p.onEdit(null); // a tap outside finishes the text being typed
      return;
    }
    const at = toPdf(e);
    if (p.tool === "select") {
      p.onSelect(null);
      return;
    }
    // The new box takes focus; stop the browser's own mousedown from taking it back to the page.
    if (p.tool === "text" || p.tool === "note") e.preventDefault();
    if (p.tool === "text") {
      const id = newId();
      // Kept inside the page; in an Arabic UI the tap marks the box's right edge (where writing starts).
      const r = host.current!.getBoundingClientRect();
      const [cx, cy] = [e.clientX - r.left, e.clientY - r.top];
      const px = Math.min(240 * p.scale, w - 16);
      const rtlUi = document.documentElement.dir === "rtl";
      const left = Math.max(8, Math.min(rtlUi ? cx - px : cx, w - 8 - px));
      const start = vp.convertToPdfPoint(left, cy) as Pt;
      p.onAdd({ id, page: p.index, kind: "text", at: start, width: px / p.scale, text: "", size: p.textSize, color: p.color, align: "start" });
      p.onEdit(id);
      return;
    }
    if (p.tool === "note") {
      const id = newId();
      p.onAdd({ id, page: p.index, kind: "note", at, text: "", color: p.color });
      p.onEdit(id);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { start: at, screen: [e.clientX, e.clientY], pts: [at] };
    if (p.tool === "ink") setDraft({ kind: "ink", pts: [at] });
    if (TEXT_TOOLS.includes(p.tool)) {
      const g = gesture.current;
      g.ready = p
        .layout(p.index)
        .then((l) => {
          g.layout = l;
          g.area = !hasText(l);
        })
        .catch(() => {
          g.area = true;
        });
    }
  };

  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !vp) return;
    const at = toPdf(e);
    g.last = at;
    if (TEXT_TOOLS.includes(p.tool)) setDraft(markup(g, at));
    else if (p.tool === "ink") {
      // Every sample the pointer took since the last frame, not just the last one: smooth, fast strokes.
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      if (evs.length) for (const ev of evs) g.pts!.push(toPdf(ev));
      else g.pts!.push(at);
      setDraft({ kind: "ink", pts: [...g.pts!] });
    } else if (SHAPES.includes(p.tool)) setDraft({ kind: "shape", a: g.start, b: at });
  };

  /** What a text tool marks between the gesture's start and `at`: the text, or on a scan the dragged area. */
  const markup = (g: NonNullable<typeof gesture.current>, at: Pt): Draft | null => {
    if (g.area) {
      const r = spanRect(g.start, at);
      return r.w > 2 && r.h > 2 ? { kind: "sel", rects: [r], text: "" } : null;
    }
    const s = g.layout ? selectText(g.layout, g.start, at) : null;
    return s ? { kind: "sel", rects: s.rects, text: s.text } : null;
  };

  const up = async () => {
    const g = gesture.current;
    gesture.current = null;
    let d = draft;
    setDraft(null);
    if (!g) return;
    // A quick drag can end before the page's text was read: mark it now that it is.
    if (TEXT_TOOLS.includes(p.tool) && g.last && d?.kind !== "sel") {
      await g.ready;
      d = markup(g, g.last);
    }
    if (!d) return;
    const base = { id: newId(), page: p.index };
    if (d.kind === "sel" && d.rects.length && TEXT_TOOLS.includes(p.tool))
      p.onAdd({ ...base, kind: p.tool as "highlight", rects: d.rects, text: d.text, color: p.color });
    else if (d.kind === "ink" && d.pts.length) {
      // Drop samples that add nothing (under half a screen pixel off the curve): smaller files, same look.
      const pts = simplify(d.pts, 0.5 / p.scale);
      p.onAdd({ ...base, kind: "ink", paths: [pts], color: p.color, width: p.stroke });
    }
    else if (d.kind === "shape" && Math.hypot(d.a[0] - d.b[0], d.a[1] - d.b[1]) > 3)
      p.onAdd({ ...base, kind: p.tool as "rect", a: d.a, b: d.b, color: p.color, width: p.stroke });
  };

  // ---- moving and reshaping a selected mark ----
  const reshape = (m: Mark, h: Handle | null, start: Pt, at: Pt, dxScreen: number): Mark => {
    if (!h) return moveMark(m, at[0] - start[0], at[1] - start[1]);
    if ("side" in h) return m.kind === "text" ? { ...m, width: Math.max(30, m.width + dxScreen / p.scale) } : m;
    if ("end" in h) return m.kind === "line" || m.kind === "arrow" ? { ...m, [h.end]: at } : m;
    switch (m.kind) {
      case "rect":
      case "ellipse": {
        const r = stretch(spanRect(m.a, m.b), h.corner, at, false);
        return { ...m, a: [r.x, r.y], b: [r.x + r.w, r.y + r.h] };
      }
      case "image":
        return { ...m, box: stretch(m.box, h.corner, at, true) };
      case "ink": {
        const from = markBounds(m);
        return { ...m, paths: scalePaths(m.paths, from, stretch(from, h.corner, at, true)) };
      }
      default:
        return m;
    }
  };

  const grab = (e: RPointerEvent, m: Mark, h: Handle | null) => {
    if (p.tool !== "select" || p.editing === m.id) return;
    e.stopPropagation();
    e.preventDefault();
    if (p.editing) p.onEdit(null);
    p.onSelect(m.id);
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const start = toPdf(e);
    const [sx, sy] = [e.clientX, e.clientY];
    let last: Mark | null = null;
    const onMove = (ev: PointerEvent) => {
      // A small wobble while tapping to select isn't a move.
      if (!last && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      last = reshape(m, h, start, toPdf(ev), ev.clientX - sx);
      setDraft({ kind: "live", id: m.id, mark: last });
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove as EventListener);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      setDraft(null);
      if (last) p.onUpdate(m.id, last);
    };
    el.addEventListener("pointermove", onMove as EventListener);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  // A mark as currently shown (live while dragging).
  const shown = <M extends Mark>(m: M): M => (draft?.kind === "live" && draft.id === m.id ? (draft.mark as M) : m);

  /** Handles of a selected mark, in screen space. */
  const handles = (raw: Mark, m: Mark) => {
    const r = coarse() ? 10 : 6;
    const dot = (key: string, [x, y]: Pt, h: Handle, cursor: string) => (
      <circle key={key} className="handle" cx={x} cy={y} r={r} style={{ cursor }} onPointerDown={(e) => grab(e, raw, h)} />
    );
    if (m.kind === "line" || m.kind === "arrow") return [dot("a", toView(m.a), { end: "a" }, "move"), dot("b", toView(m.b), { end: "b" }, "move")];
    const box = m.kind === "rect" || m.kind === "ellipse" ? spanRect(m.a, m.b) : m.kind === "image" ? m.box : m.kind === "ink" ? markBounds(m) : null;
    if (!box) return null;
    const cs = corners(box);
    return cs.map((c, k) => {
      const v = toView(c);
      const o = toView(cs[(k + 2) % 4]);
      // A diagonal cursor matching the corner's direction on screen.
      const cursor = (v[0] - o[0]) * (v[1] - o[1]) > 0 ? "nwse-resize" : "nesw-resize";
      return dot(`c${k}`, v, { corner: k }, cursor);
    });
  };

  const sw = (n: number) => Math.max(1, n * p.scale);
  const selectable = p.tool === "select";

  const drawMark = (raw: Mark) => {
    const m = shown(raw);
    const sel = p.selected === m.id;
    const common = {
      "data-id": m.id,
      className: `mark${selectable ? " grab" : ""}${sel ? " selected" : ""}`,
      onPointerDown: (e: RPointerEvent<SVGGElement>) => grab(e, raw, null),
      onDoubleClick: () => (m.kind === "note" ? p.onEdit(m.id) : undefined),
    };
    const c = css((m as { color?: Rgb }).color ?? [0, 0, 0]);
    let body: React.ReactNode = null;
    let box: Rect | null = null;
    switch (m.kind) {
      case "highlight":
      case "underline":
      case "strike":
        body = m.rects.map((r, i) => {
          const s = screenBox(rectPts(r));
          if (m.kind === "highlight") return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={css(m.color, 0.4)} className="hl-fill" />;
          const y = m.kind === "underline" ? r.y + r.h * 0.05 : r.y + r.h * 0.45;
          const [a, b] = [toView([r.x, y]), toView([r.x + r.w, y])];
          return (
            <g key={i}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="transparent" />
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth={sw(Math.max(1, r.h * 0.07))} />
            </g>
          );
        });
        box = screenBox(m.rects.flatMap(rectPts));
        break;
      case "ink": {
        const d = m.paths.map((path) => svgStroke(path, toView)).join(" ");
        body = (
          <>
            <path d={d} className="hit" />
            <path d={d} fill="none" stroke={c} strokeWidth={sw(m.width)} strokeLinecap="round" strokeLinejoin="round" />
          </>
        );
        box = screenBox(m.paths.flat());
        break;
      }
      case "rect":
      case "ellipse": {
        const s = screenBox([m.a, m.b]);
        const shape =
          m.kind === "rect" ? (
            <rect x={s.x} y={s.y} width={s.w} height={s.h} />
          ) : (
            <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} />
          );
        body = (
          <>
            <g className="hit">{shape}</g>
            <g fill="none" stroke={c} strokeWidth={sw(m.width)}>
              {shape}
            </g>
          </>
        );
        box = s;
        break;
      }
      case "line":
      case "arrow": {
        const [a, b] = [toView(m.a), toView(m.b)];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        // Same size as in the saved PDF (write.ts arrowHead), in page points.
        const len = Math.max(8, m.width * 4) * p.scale;
        const head = (k: number) => [b[0] - len * Math.cos(ang + k), b[1] - len * Math.sin(ang + k)];
        const d = `M${a.join(" ")} L${b.join(" ")}` + (m.kind === "arrow" ? ` M${head(0.45).join(" ")} L${b.join(" ")} L${head(-0.45).join(" ")}` : "");
        body = (
          <>
            <path d={d} className="hit" />
            <path d={d} fill="none" stroke={c} strokeWidth={sw(m.width)} strokeLinecap="round" strokeLinejoin="round" />
          </>
        );
        box = screenBox([m.a, m.b]);
        break;
      }
      case "note": {
        const s = screenBox([m.at, [m.at[0] + 20, m.at[1] - 20]]);
        body = (
          <g>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill={c} stroke="rgba(0,0,0,.45)" />
            {[0.32, 0.5, 0.68].map((f, i) => (
              <line key={i} x1={s.x + s.w * 0.2} x2={s.x + s.w * (i === 2 ? 0.6 : 0.8)} y1={s.y + s.h * f} y2={s.y + s.h * f} stroke="rgba(0,0,0,.7)" strokeWidth={1.2} />
            ))}
          </g>
        );
        box = s;
        break;
      }
      case "image": {
        const s = screenBox(rectPts(m.box));
        body = <image href={urls.get(m.id)} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="none" />;
        box = s;
        break;
      }
      case "text":
        return null; // HTML, below
    }
    return (
      <g key={m.id} {...common}>
        {body}
        {sel && box && <rect className="sel-box" x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8} />}
        {sel && m.id !== "draft" && handles(raw, m)}
      </g>
    );
  };

  const texts = p.marks.filter((m): m is Extract<Mark, { kind: "text" }> => m.kind === "text");
  const note = p.marks.find((m): m is Extract<Mark, { kind: "note" }> => m.kind === "note" && m.id === p.editing);

  return (
    <div ref={host} className="ed-page" style={{ width: w, height: h }}>
      {visible && <PageView doc={p.doc} pageNumber={p.index + 1} scale={p.scale} night={false} highlights={[]} width={w} height={h} />}
      {vp && (
        <div
          className={`ed-overlay tool-${p.tool}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(null);
          }}
        >
          <svg width={w} height={h}>
            {p.marks.map(drawMark)}
            {draft?.kind === "sel" &&
              draft.rects.map((r, i) => {
                const s = screenBox(rectPts(r));
                return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={css(p.color, 0.35)} />;
              })}
            {draft?.kind === "ink" && (
              <path d={svgStroke(draft.pts, toView)} fill="none" stroke={css(p.color)} strokeWidth={sw(p.stroke)} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {draft?.kind === "shape" &&
              drawMark({ id: "draft", page: p.index, kind: p.tool as "rect", a: draft.a, b: draft.b, color: p.color, width: p.stroke })}
          </svg>
          {texts.map((raw) => {
            const m = shown(raw);
            const [x, y] = toView(m.at);
            const style = { left: x, top: y, width: m.width * p.scale, fontSize: m.size * p.scale, color: css(m.color) };
            if (p.editing === m.id)
              return (
                <TextEditor
                  key={m.id}
                  style={style}
                  value={m.text}
                  onDone={(text) => {
                    p.onEdit(null);
                    if (!text.trim()) p.onRemove(m.id);
                    else if (text !== m.text) p.onUpdate(m.id, { text } as Partial<Mark>);
                  }}
                />
              );
            const sel = p.selected === m.id;
            return (
              <div
                key={m.id}
                className={`ed-text${selectable ? " grab" : ""}${sel ? " selected" : ""}`}
                style={style}
                onPointerDown={(e) => grab(e, raw, null)}
                onDoubleClick={() => p.onEdit(m.id)}
              >
                {m.text}
                {sel && <span className="handle side" onPointerDown={(e) => grab(e, raw, { side: true })} />}
              </div>
            );
          })}
          {p.answers?.map((a) => {
            const s = screenBox(rectPts(a.rect));
            return (
              <div
                key={a.name}
                className={`ed-answer${p.tool === "select" ? " grab" : ""}`}
                style={{ left: s.x, top: s.y, width: s.w, height: s.h, fontSize: Math.max(9, Math.min(s.h * 0.62, 16 * p.scale)) }}
                onPointerDown={(e) => {
                  if (p.tool !== "select") return;
                  e.stopPropagation();
                  p.onField?.(a.name);
                }}
              >
                <bdi>{a.text}</bdi>
              </div>
            );
          })}
          {note && <NoteEditor at={toView(note.at)} pageW={w} value={note.text} onDone={(text) => {
            p.onEdit(null);
            if (!text.trim() && !note.text) p.onRemove(note.id);
            else if (text !== note.text) p.onUpdate(note.id, { text } as Partial<Mark>);
          }} onDelete={() => {
            p.onEdit(null);
            p.onRemove(note.id);
          }} />}
        </div>
      )}
    </div>
  );
}

/**
 * Text being typed is kept when the editor goes away for any reason (blur, a tap elsewhere, a tool
 * change). The unmount is checked a tick later so React's dev double-mount doesn't count as leaving.
 */
function useCommit(initial: string, onDone: (text: string) => void) {
  const [text, setText] = useState(initial);
  const latest = useRef(initial);
  const done = useRef(false);
  const cb = useRef(onDone);
  cb.current = onDone;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    cb.current(latest.current);
  };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => !mounted.current && finish(), 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: string) => {
    latest.current = v;
    setText(v);
  };
  const skip = () => (done.current = true);
  return { text, change, finish, skip };
}

function useFocus(ref: React.RefObject<HTMLTextAreaElement | null>) {
  useEffect(() => {
    const go = () => {
      const el = ref.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    };
    go();
    const id = requestAnimationFrame(go);
    return () => cancelAnimationFrame(id);
  }, [ref]);
}

function TextEditor({ style, value, onDone }: { style: React.CSSProperties; value: string; onDone(text: string): void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { text, change, finish } = useCommit(value, onDone);
  useFocus(ref);
  useEffect(() => {
    const el = ref.current!;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      className="ed-text editing"
      dir="auto"
      style={style}
      value={text}
      rows={1}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Escape") ref.current?.blur();
        e.stopPropagation();
      }}
    />
  );
}

const NOTE_W = 240;

function NoteEditor({ at, pageW, value, onDone, onDelete }: { at: Pt; pageW: number; value: string; onDone(text: string): void; onDelete(): void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { text, change, finish, skip } = useCommit(value, onDone);
  useFocus(ref);
  const left = Math.max(8, Math.min(at[0], pageW - NOTE_W - 8));
  return (
    <div className="ed-note" style={{ left, top: at[1] + 6, width: NOTE_W }} onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        dir="auto"
        rows={4}
        value={text}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") finish();
          e.stopPropagation();
        }}
      />
      <div className="ed-note-actions">
        <NoteButtons
          onDelete={() => {
            skip();
            onDelete();
          }}
          onDone={finish}
        />
      </div>
    </div>
  );
}

function NoteButtons({ onDelete, onDone }: { onDelete(): void; onDone(): void }) {
  const t = useT();
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onDelete}>
        {t.edDelete}
      </button>
      <button className="btn btn-primary btn-sm" onClick={onDone}>
        {t.edDone}
      </button>
    </>
  );
}
