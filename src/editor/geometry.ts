// Pure geometry for the editor, all in PDF user space (points, y up).
import type { PageLayout } from "../text/search";
import type { Mark, Pt, Rect } from "./marks";

const real = (l: PageLayout, i: number) => l.boxes[i] && l.boxes[i].w > 0 && l.text[i] !== "\n";

/** Index of the letter under `p`; otherwise the nearest letter on the nearest line. -1 for no text. */
export function charIndexAt(layout: PageLayout, [px, py]: Pt): number {
  let best = -1;
  let bestScore = Infinity;
  layout.boxes.forEach((b, i) => {
    if (!real(layout, i)) return;
    const dy = py < b.y ? b.y - py : py > b.y + b.h ? py - (b.y + b.h) : 0;
    const dx = px < b.x ? b.x - px : px > b.x + b.w ? px - (b.x + b.w) : 0;
    // Being on the line matters far more than being near along it.
    const score = dy * 1000 + dx;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** The text between two points, in reading order, as one rect per line. */
export function selectText(layout: PageLayout, a: Pt, b: Pt): { start: number; end: number; text: string; rects: Rect[] } | null {
  const i = charIndexAt(layout, a);
  const j = charIndexAt(layout, b);
  if (i < 0 || j < 0) return null;
  const start = Math.min(i, j);
  const end = Math.max(i, j) + 1;
  // One rect per line of the layout ("\n" separates them). Letters of one line can sit a hair
  // apart vertically (harakat, mixed fonts); grouping by rounded y split a line into several
  // overlapping rects, which showed as darker blotches in a highlight.
  const lines: { x1: number; x2: number; y1: number; y2: number }[] = [];
  let cur: (typeof lines)[number] | null = null;
  for (let k = start; k < end; k++) {
    if (layout.text[k] === "\n") {
      cur = null;
      continue;
    }
    if (!real(layout, k)) continue;
    const bx = layout.boxes[k];
    if (!cur) lines.push((cur = { x1: bx.x, x2: bx.x + bx.w, y1: bx.y, y2: bx.y + bx.h }));
    else {
      cur.x1 = Math.min(cur.x1, bx.x);
      cur.x2 = Math.max(cur.x2, bx.x + bx.w);
      cur.y1 = Math.min(cur.y1, bx.y);
      cur.y2 = Math.max(cur.y2, bx.y + bx.h);
    }
  }
  const rects = lines.map((l) => ({ x: l.x1, y: l.y1, w: l.x2 - l.x1, h: l.y2 - l.y1 }));
  return rects.length ? { start, end, text: layout.text.slice(start, end), rects } : null;
}

const add = ([x, y]: Pt, dx: number, dy: number): Pt => [x + dx, y + dy];

export function moveMark(m: Mark, dx: number, dy: number): Mark {
  switch (m.kind) {
    case "highlight":
    case "underline":
    case "strike":
      return { ...m, rects: m.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) };
    case "ink":
      return { ...m, paths: m.paths.map((p) => p.map((q) => add(q, dx, dy))) };
    case "rect":
    case "ellipse":
    case "line":
    case "arrow":
      return { ...m, a: add(m.a, dx, dy), b: add(m.b, dx, dy) };
    case "note":
    case "text":
      return { ...m, at: add(m.at, dx, dy) };
    case "image":
      return { ...m, box: { ...m.box, x: m.box.x + dx, y: m.box.y + dy } };
  }
}

/** A copy of `m` with a new id on `page`, nudged down and to the right so it doesn't hide the original. */
export function duplicateMark(m: Mark, id: string, page = m.page, offset = 12): Mark {
  return { ...moveMark(m, offset, -offset), id, page };
}

/** A text box's width dragged from its start (`edge` -1, left) or end (1, right) by `dx` points. */
export function resizeTextBox<M extends { at: Pt; width: number }>(m: M, edge: -1 | 1, dx: number, min = 30): M {
  if (edge === 1) return { ...m, width: Math.max(min, m.width + dx) };
  const width = Math.max(min, m.width - dx);
  return { ...m, width, at: [m.at[0] + (m.width - width), m.at[1]] };
}

/** An image of iw×ih fitted inside maxW×maxH (never enlarged), centred on `c`. */
export function fitBox(iw: number, ih: number, maxW: number, maxH: number, [cx, cy]: Pt): Rect {
  const s = Math.min(1, maxW / iw, maxH / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const MIN = 8;

/** A new width for `box`, aspect kept, its top-left corner fixed. */
export function resizeBox(box: Rect, w: number): Rect {
  const nw = Math.max(MIN, w);
  const h = (box.h / box.w) * nw;
  const top = box.y + box.h;
  return { x: box.x, y: top - h, w: nw, h };
}

/** Ramer–Douglas–Peucker: drops points closer than `tol` to the line through their neighbours. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = pts[i];
    const [bx, by] = pts[j];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1;
    let dist = 0;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k];
      const d = len ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay);
      if (d > dist) {
        dist = d;
        worst = k;
      }
    }
    if (worst > 0 && dist > tol) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** A cubic Bézier segment: two control points and the end point. */
export type Cubic = [Pt, Pt, Pt];

/**
 * A smooth curve through a freehand stroke: each sampled point becomes a quadratic control
 * point between the midpoints of its neighbouring segments (written as cubics, which both SVG and
 * PDF draw). The curve starts and ends exactly on the first and last points.
 */
export function smoothCurve(pts: Pt[]): { start: Pt; curves: Cubic[] } {
  if (pts.length < 3) return { start: pts[0] ?? [0, 0], curves: pts.slice(1).map((p) => [pts[0], p, p] as Cubic) };
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // A quadratic (p0, q, p2) as a cubic: controls two thirds of the way from each end to q.
  const quad = (p0: Pt, q: Pt, p2: Pt): Cubic => [
    [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])],
    [p2[0] + (2 / 3) * (q[0] - p2[0]), p2[1] + (2 / 3) * (q[1] - p2[1])],
    p2,
  ];
  const curves: Cubic[] = [];
  let from = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const to = i === pts.length - 2 ? pts[i + 1] : mid(pts[i], pts[i + 1]);
    curves.push(quad(from, pts[i], to));
    from = to;
  }
  return { start: pts[0], curves };
}

/** SVG path data for a freehand stroke, `map` turning page points into screen points. */
export function svgStroke(pts: Pt[], map: (p: Pt) => Pt = (p) => p): string {
  if (!pts.length) return "";
  const { start, curves } = smoothCurve(pts.map(map));
  const n = (v: number) => Math.round(v * 100) / 100;
  // A single tap still shows as a dot (a zero-length segment with a round cap).
  if (!curves.length) return `M${n(start[0])} ${n(start[1])} l0.01 0`;
  return `M${n(start[0])} ${n(start[1])}` + curves.map((c) => " C" + c.map((p) => `${n(p[0])} ${n(p[1])}`).join(" ")).join("");
}

/** Bounding box of a mark's geometry (without stroke width). */
export function markBounds(m: Mark): Rect {
  let pts: Pt[];
  switch (m.kind) {
    case "ink":
      pts = m.paths.flat();
      break;
    case "rect":
    case "ellipse":
    case "line":
    case "arrow":
      pts = [m.a, m.b];
      break;
    case "image":
      pts = [
        [m.box.x, m.box.y],
        [m.box.x + m.box.w, m.box.y + m.box.h],
      ];
      break;
    case "highlight":
    case "underline":
    case "strike":
      pts = m.rects.flatMap((r): Pt[] => [
        [r.x, r.y],
        [r.x + r.w, r.y + r.h],
      ]);
      break;
    case "note":
    case "text":
      pts = [m.at];
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Freehand paths stretched from the box `from` onto the box `to`. */
export function scalePaths(paths: Pt[][], from: Rect, to: Rect): Pt[][] {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  return paths.map((p) => p.map(([x, y]) => [to.x + (x - from.x) * sx, to.y + (y - from.y) * sy] as Pt));
}

/** The rectangle spanned by two corner points. */
export function spanRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** True when the layout has at least one real letter (a scanned page has none). */
export function hasText(layout: PageLayout): boolean {
  return layout.boxes.some((_, i) => real(layout, i));
}

/**
 * Snaps a box being moved: its left/centre/right to the nearest of `xs` and its top/middle/bottom
 * to the nearest of `ys`, each only within `tol`. Returns the shift and the guide it lined up with.
 */
export function snapBox(b: Rect, xs: number[], ys: number[], tol: number): { dx: number; dy: number; gx: number | null; gy: number | null } {
  const pick = (vals: number[], targets: number[]) => {
    let best: [number, number] | null = null;
    for (const v of vals)
      for (const t of targets) {
        const d = t - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best[0]))) best = [d, t];
      }
    return best;
  };
  const x = pick([b.x, b.x + b.w / 2, b.x + b.w], xs);
  const y = pick([b.y, b.y + b.h / 2, b.y + b.h], ys);
  return { dx: x?.[0] ?? 0, dy: y?.[0] ?? 0, gx: x?.[1] ?? null, gy: y?.[1] ?? null };
}

/** `b` turned around `a` onto the nearest multiple of `step` (45° by default), length kept. */
export function constrainAngle(a: Pt, b: Pt, step = Math.PI / 4): Pt {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / step) * step;
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  return [r(a[0] + len * Math.cos(ang)), r(a[1] + len * Math.sin(ang))];
}

/** The corner opposite `a` of the square spanned towards `b` (its larger side wins). */
export function squareCorner(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + (Math.sign(dx) || 1) * s, a[1] + (Math.sign(dy) || 1) * s];
}

/** Distance from `p` to the segment a–b. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The lines a drawn mark is made of, as polylines (an ellipse as a 32-sided polygon). */
function strokesOf(m: Mark): Pt[][] {
  switch (m.kind) {
    case "ink":
      return m.paths;
    case "line":
    case "arrow":
      return [[m.a, m.b]];
    case "rect": {
      const r = spanRect(m.a, m.b);
      return [[[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y]]];
    }
    case "ellipse": {
      const r = spanRect(m.a, m.b);
      return [Array.from({ length: 33 }, (_, i): Pt => [r.x + r.w / 2 + (r.w / 2) * Math.cos((i / 32) * 2 * Math.PI), r.y + r.h / 2 + (r.h / 2) * Math.sin((i / 32) * 2 * Math.PI)])];
    }
    default:
      return [];
  }
}

/** True when the eraser at `p` (radius `tol`, page points) touches a drawn mark's line. */
export function erases(m: Mark, p: Pt, tol: number): boolean {
  const reach = tol + ("width" in m && m.kind !== "text" ? m.width / 2 : 0);
  return strokesOf(m).some((s) => (s.length === 1 ? Math.hypot(p[0] - s[0][0], p[1] - s[0][1]) <= reach : s.some((q, i) => i > 0 && segDist(p, s[i - 1], q) <= reach)));
}

/** The area a mark covers on its page: its geometry, a note's icon, a text box's lines (estimated). */
export function markArea(m: Mark): Rect {
  if (m.kind === "note") return { x: m.at[0], y: m.at[1] - 20, w: 20, h: 20 };
  if (m.kind === "text") {
    const h = m.size * 1.45 * Math.max(1, m.text.split("\n").length);
    return { x: m.at[0], y: m.at[1] - h, w: m.width, h };
  }
  return markBounds(m);
}

/** True when two rectangles overlap or touch. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** The marks a dragged selection rectangle catches: those it overlaps, in their order. */
export function marksIn(marks: Mark[], r: Rect): string[] {
  return marks.filter((m) => overlaps(markArea(m), r)).map((m) => m.id);
}
