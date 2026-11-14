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
