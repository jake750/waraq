import type { Match, PageLayout } from "../text/search";
import type { HighlightRect } from "./PageView";

/** Rectangles (PDF user space) covering a match: one per line, the union of its letters' boxes. */
export function matchRects(layout: PageLayout, m: Match, current: boolean): HighlightRect[] {
  const lines = new Map<number, { x1: number; x2: number; y: number; h: number }>();
  for (let i = m.start; i < m.end; i++) {
    const b = layout.boxes[i];
    if (!b || b.w === 0 || layout.text[i] === "\n") continue;
    const key = Math.round(b.y);
    const l = lines.get(key);
    if (!l) lines.set(key, { x1: b.x, x2: b.x + b.w, y: b.y, h: b.h });
    else {
      l.x1 = Math.min(l.x1, b.x);
      l.x2 = Math.max(l.x2, b.x + b.w);
      l.h = Math.max(l.h, b.h);
    }
  }
  return [...lines.values()].map((l) => ({ x: l.x1, y: l.y, w: l.x2 - l.x1, h: l.h, current }));
}
