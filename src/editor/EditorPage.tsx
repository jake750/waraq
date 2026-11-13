import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import PageView from "../reader/PageView";
import { useT } from "../i18n";
import type { PageLayout } from "../text/search";
import { css, newId, type Mark, type Pt, type Rect, type Rgb } from "./marks";
import { moveMark, resizeBox, selectText } from "./geometry";

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
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string; f: number };

/** One page in the editor: the rendered page with its marks drawn over it, and the pointer tools. */
export default function EditorPage(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const gesture = useRef<{ start: Pt; screen: Pt; layout?: PageLayout; pts?: Pt[] } | null>(null);
  const w = p.size.w * p.scale;
  const h = p.size.h * p.scale;

  // Only pages near the screen are rendered.
  useEffect(() => {
    const el = host.current!;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    p.doc
      .getPage(p.index + 1)
      .then((page) => alive && setVp(page.getViewport({ scale: p.scale })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p.doc, p.index, p.scale]);

  const urls = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of p.marks) if (k.kind === "image") m.set(k.id, URL.createObjectURL(new Blob([k.bytes as BlobPart], { type: k.fmt === "png" ? "image/png" : "image/jpeg" })));
    return m;
  }, [p.marks]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

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
    if (TEXT_TOOLS.includes(p.tool)) gesture.current.layout = await p.layout(p.index).catch(() => undefined);
    if (p.tool === "ink") setDraft({ kind: "ink", pts: [at] });
  };

  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !vp) return;
    const at = toPdf(e);
    if (TEXT_TOOLS.includes(p.tool)) {
      const s = g.layout ? selectText(g.layout, g.start, at) : null;
      setDraft(s ? { kind: "sel", rects: s.rects, text: s.text } : null);
    } else if (p.tool === "ink") {
      g.pts!.push(at);
      setDraft({ kind: "ink", pts: [...g.pts!] });
    } else if (SHAPES.includes(p.tool)) setDraft({ kind: "shape", a: g.start, b: at });
  };

  const up = () => {
    const g = gesture.current;
    gesture.current = null;
    const d = draft;
    setDraft(null);
    if (!g || !d) return;
    const base = { id: newId(), page: p.index };
    if (d.kind === "sel" && d.rects.length && TEXT_TOOLS.includes(p.tool))
      p.onAdd({ ...base, kind: p.tool as "highlight", rects: d.rects, text: d.text, color: p.color });
    else if (d.kind === "ink" && d.pts.length > 1) p.onAdd({ ...base, kind: "ink", paths: [d.pts], color: p.color, width: p.stroke });
    else if (d.kind === "shape" && Math.hypot(d.a[0] - d.b[0], d.a[1] - d.b[1]) > 3)
      p.onAdd({ ...base, kind: p.tool as "rect", a: d.a, b: d.b, color: p.color, width: p.stroke });
  };

  // ---- moving and resizing a selected mark ----
  const grab = (e: RPointerEvent, m: Mark, mode: "move" | "resize") => {
    if (p.tool !== "select" || p.editing === m.id) return;
    e.stopPropagation();
    e.preventDefault();
    if (p.editing) p.onEdit(null);
    p.onSelect(m.id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const start = toPdf(e);
    const sx = e.clientX;
    let last: Draft | null = null;
    const el = e.currentTarget as Element;
    const onMove = (ev: PointerEvent) => {
      if (mode === "move") {
        const at = toPdf(ev);
        last = { kind: "move", id: m.id, dx: at[0] - start[0], dy: at[1] - start[1] };
      } else {
        const base = m.kind === "image" ? screenBox(rectPts(m.box)).w : m.kind === "text" ? m.width * p.scale : 1;
        last = { kind: "resize", id: m.id, f: Math.max(0.05, (base + ev.clientX - sx) / base) };
      }
      setDraft(last);
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove as EventListener);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      setDraft(null);
      if (!last) return;
      if (last.kind === "move" && Math.hypot(last.dx, last.dy) > 0.5) p.onUpdate(m.id, moveMark(m, last.dx, last.dy));
      if (last.kind === "resize") {
        if (m.kind === "image") p.onUpdate(m.id, { box: resizeBox(m.box, m.box.w * last.f) } as Partial<Mark>);
        if (m.kind === "text") p.onUpdate(m.id, { width: Math.max(30, m.width * last.f) } as Partial<Mark>);
      }
    };
    el.addEventListener("pointermove", onMove as EventListener);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  // A mark as currently shown (live while dragging).
  const shown = <M extends Mark>(m: M): M => {
    if (draft?.kind === "move" && draft.id === m.id) return moveMark(m, draft.dx, draft.dy) as M;
    if (draft?.kind === "resize" && draft.id === m.id) {
      if (m.kind === "image") return { ...m, box: resizeBox(m.box, m.box.w * draft.f) };
      if (m.kind === "text") return { ...m, width: Math.max(30, m.width * draft.f) };
    }
    return m;
  };

  const sw = (n: number) => Math.max(1, n * p.scale);
  const selectable = p.tool === "select";

  const drawMark = (raw: Mark) => {
    const m = shown(raw);
    const sel = p.selected === m.id;
    const common = {
      "data-id": m.id,
      className: `mark${selectable ? " grab" : ""}${sel ? " selected" : ""}`,
      onPointerDown: (e: RPointerEvent<SVGGElement>) => grab(e, raw, "move"),
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
        const d = m.paths.map((path) => "M" + path.map((q) => toView(q).join(" ")).join(" L")).join(" ");
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
        const len = Math.max(8, sw(m.width) * 4);
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
        {sel && m.kind === "image" && box && (
          <rect className="handle" x={box.x + box.w - 6} y={box.y + box.h - 6} width={12} height={12} onPointerDown={(e) => grab(e, raw, "resize")} />
        )}
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
              <path d={"M" + draft.pts.map((q) => toView(q).join(" ")).join(" L")} fill="none" stroke={css(p.color)} strokeWidth={sw(p.stroke)} strokeLinecap="round" strokeLinejoin="round" />
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
                onPointerDown={(e) => grab(e, raw, "move")}
                onDoubleClick={() => p.onEdit(m.id)}
              >
                {m.text}
                {sel && <span className="handle side" onPointerDown={(e) => grab(e, raw, "resize")} />}
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
