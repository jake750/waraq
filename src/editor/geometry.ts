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
  const lines = new Map<number, { x1: number; x2: number; y: number; h: number }>();
  for (let k = start; k < end; k++) {
    if (!real(layout, k)) continue;
    const bx = layout.boxes[k];
    const key = Math.round(bx.y);
    const l = lines.get(key);
    if (!l) lines.set(key, { x1: bx.x, x2: bx.x + bx.w, y: bx.y, h: bx.h });
    else {
      l.x1 = Math.min(l.x1, bx.x);
      l.x2 = Math.max(l.x2, bx.x + bx.w);
      l.h = Math.max(l.h, bx.h);
    }
  }
  const rects = [...lines.values()].map((l) => ({ x: l.x1, y: l.y, w: l.x2 - l.x1, h: l.h }));
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
