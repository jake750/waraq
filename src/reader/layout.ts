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

/**
 * Canvas bitmap size for a page shown at `cssW`×`cssH`: the device ratio, lowered when the
 * bitmap would exceed `maxPixels` (big zoom on a phone otherwise blanks the page or crashes).
 */
export function canvasPixels(cssW: number, cssH: number, ratio: number, maxPixels: number) {
  const fit = Math.sqrt(maxPixels / (cssW * cssH));
  const r = Math.min(ratio, fit);
  return { w: Math.floor(cssW * r), h: Math.floor(cssH * r), ratio: r };
}

/** Sizes with page `index` corrected; the same array when nothing changed. */
export function withPageSize<S extends { w: number; h: number }>(sizes: S[], index: number, size: S): S[] {
  const old = sizes[index];
  if (!old || (Math.abs(old.w - size.w) < 0.5 && Math.abs(old.h - size.h) < 0.5)) return sizes;
  const next = sizes.slice();
  next[index] = size;
  return next;
}

/** A typed page number; accepts Arabic-Indic (٠-٩) and Persian (۰-۹) digits. NaN when empty. */
export function parsePageNumber(s: string): number {
  const ascii = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
  return parseInt(ascii, 10);
}
