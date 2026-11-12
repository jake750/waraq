// Pure layout maths for the viewer: where each page sits and which ones are worth rendering.

export function pageOffsets(heights: number[], gap: number): number[] {
  const out: number[] = [];
  let y = 0;
  for (const h of heights) {
    out.push(y);
    y += h + gap;
  }
  return out;
}

/** Indices (0-based) of pages intersecting the viewport, plus `overscan` on each side. */
export function visiblePages(scrollTop: number, viewport: number, heights: number[], gap: number, overscan: number): number[] {
  if (heights.length === 0) return [];
  const tops = pageOffsets(heights, gap);
  const bottom = scrollTop + viewport;
  // Binary search for the first page whose bottom is below scrollTop.
  let lo = 0;
  let hi = heights.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] + heights[mid] <= scrollTop) lo = mid + 1;
    else hi = mid;
  }
  let last = lo;
  while (last + 1 < heights.length && tops[last + 1] < bottom) last++;
  const from = Math.max(0, lo - overscan);
  const to = Math.min(heights.length - 1, last + overscan);
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/** Two-page spreads (1-based page numbers). With `coverAlone`, page 1 stands by itself like a book cover. */
export function spreadGroups(pageCount: number, coverAlone: boolean): number[][] {
  const out: number[][] = [];
  let p = 1;
  if (coverAlone && pageCount > 0) out.push([p++]);
  while (p <= pageCount) {
    out.push(p + 1 <= pageCount ? [p, p + 1] : [p]);
    p += 2;
  }
  return out;
}

export function fitScale(mode: "width" | "page", page: { w: number; h: number }, box: { w: number; h: number }): number {
  const sw = box.w / page.w;
  return mode === "width" ? sw : Math.min(sw, box.h / page.h);
}
