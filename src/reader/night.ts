// Night mode for a rendered page: white paper turns near-black and black ink turns light, while
// coloured ink keeps its hue (dark blue becomes light blue). Photos are put back (slightly dimmed);
// scanned pages and white-background figures are recoloured like the page around them.

/** How the night page looks: text brightness (0 dim, 1 normal, 2 bright) and an optional warm tint. */
export type NightOptions = { level: 0 | 1 | 2; warm: boolean };
export const DEFAULT_NIGHT: NightOptions = { level: 1, warm: false };

/** Darkest value the paper becomes. */
const PAPER = 18;
/** Brightest value ink becomes, per level: soft white by default, so text doesn't glare. */
const INK = [190, 226, 250];
/** Warm tint: blue and some green are held back (less blue light at night). */
const WARM = [1, 0.9, 0.72];
/** How much photos are darkened per level, so they don't glare out of a dark page. */
const PHOTO_DIM = [0.3, 0.14, 0];

const luts = new Map<string, Uint8ClampedArray[]>();
/** Per-channel tables: a flipped channel value (0..255) → the final value, squeezed into PAPER..INK. */
export function nightLut(o: NightOptions = DEFAULT_NIGHT): Uint8ClampedArray[] {
  const key = `${o.level}${o.warm ? "w" : ""}`;
  let lut = luts.get(key);
  if (!lut) {
    const ink = INK[o.level] ?? INK[1];
    lut = [0, 1, 2].map((c) => Uint8ClampedArray.from({ length: 256 }, (_, v) => Math.round((PAPER + (v * (ink - PAPER)) / 255) * (o.warm ? WARM[c] : 1))));
    luts.set(key, lut);
  }
  return lut;
}

/**
 * Inverts lightness in place, keeping hue. Every channel shifts by 255 - 2Y, where Y is the
 * perceived luminance, so the result has luminance 255 - Y: dark blue and red text come out as
 * light as black text does (a plain HSL flip left them dark). The result then goes through the
 * night tables. Runs of identical pixels (paper, solid fills) reuse the last result.
 */
export function nightPixels(data: Uint8ClampedArray, width = 0, solid = 0, o: NightOptions = DEFAULT_NIGHT): void {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2);
  const keep = width > 0 && solid > 0 ? darkAreas(data, width, solid, true) : null;
  const [lr, lg, lb] = nightLut(o);
  let last = -1;
  let lastOut = 0;
  for (let j = 0; j < words.length; j++) {
    if (keep && keep[j]) continue;
    const p = words[j];
    if (p === last) {
      words[j] = lastOut;
      continue;
    }
    const i = j << 2;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const shift = 255 - 2 * ((54 * r + 183 * g + 19 * b) >> 8);
    const nr = r + shift;
    const ng = g + shift;
    const nb = b + shift;
    data[i] = lr[nr < 0 ? 0 : nr > 255 ? 255 : nr];
    data[i + 1] = lg[ng < 0 ? 0 : ng > 255 ? 255 : ng];
    data[i + 2] = lb[nb < 0 ? 0 : nb > 255 ? 255 : nb];
    last = p;
    lastOut = words[j];
  }
  if (keep) softenEdges(data, words, keep, width);
}

/**
 * The anti-aliased rim of a kept dark area would show as a grey or bright outline on the night
 * page. Its outer pixels (kept) take the darkest colour next to them inside the area, then the
 * pixels just outside it (marked 2) take the colour of the area beside them.
 */
function softenEdges(data: Uint8ClampedArray, words: Uint32Array, keep: Uint8Array, w: number): void {
  const h = Math.floor(keep.length / w);
  const lum = (j: number) => data[j << 2] + data[(j << 2) + 1] + data[(j << 2) + 2];
  const rim: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (keep[j] !== 1) continue;
      if ((x > 0 && keep[j - 1] !== 1) || (x < w - 1 && keep[j + 1] !== 1) || (y > 0 && keep[j - w] !== 1) || (y < h - 1 && keep[j + w] !== 1)) rim.push(j);
    }
  const out = rim.map((j) => {
    const x = j % w;
    let best = j;
    for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) if (k >= 0 && k < keep.length && keep[k] === 1 && lum(k) < lum(best)) best = k;
    return words[best];
  });
  rim.forEach((j, i) => (words[j] = out[i]));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (keep[j] !== 2) continue;
      const k = x > 0 && keep[j - 1] === 1 ? j - 1 : x < w - 1 && keep[j + 1] === 1 ? j + 1 : y > 0 && keep[j - w] === 1 ? j - w : j + w;
      words[j] = words[k];
    }
}

/** A channel maximum below this counts as dark (fills, frames, bars). */
const DARK = 96;

/**
 * Pixels that already read as dark mode, so they keep their colours (1): dark areas thicker than
 * `2 * r` px (frames, bars), dark boxes and panels with the light text inside them (`regions`),
 * however closely that text is set. Thin dark ink (text on paper) is not included. Pixels just
 * outside those areas are marked 2: they take the area's colour, so its anti-aliased edge doesn't
 * turn into a bright outline. Null when the page has nothing thick and dark, which skips the work.
 */
export function darkAreas(data: Uint8ClampedArray, w: number, r: number, regions = false): Uint8Array | null {
  const h = Math.floor(data.length / 4 / w);
  if (w <= 0 || h <= 0 || !hasThickDark(data, w, h, r)) return null;
  const a = new Uint8Array(w * h);
  for (let j = 0, i = 0; j < a.length; j++, i += 4) a[j] = data[i] < DARK && data[i + 1] < DARK && data[i + 2] < DARK ? 1 : 0;
  const b = new Uint8Array(w * h);
  const pass = (rad: number, erode: boolean) => {
    boxPass(a, b, w, h, rad, erode, true);
    boxPass(b, a, w, h, rad, erode, false);
  };
  // Opening drops thin ink; closing fills the light text holes inside what is left.
  pass(r, true);
  pass(2 * r, false); // the opening's dilation and the closing's, in one
  pass(r, true);
  if (regions) addRegions(data, a, w, h, r);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (a[j] !== 0) continue;
      if ((x > 0 && a[j - 1] === 1) || (x < w - 1 && a[j + 1] === 1) || (y > 0 && a[j - w] === 1) || (y < h - 1 && a[j + w] === 1)) a[j] = 2;
    }
  return a;
}

/**
 * Some 2r x 2r tile of the page is at least 40% dark: anything thick enough to keep (a 2r-thick
 * bar covers half of some tile) must show up here. Plain text pages stay below it.
 */
function hasThickDark(data: Uint8ClampedArray, w: number, h: number, r: number): boolean {
  const t = Math.max(2, 2 * r);
  const tw = Math.ceil(w / t);
  const cnt = new Uint32Array(tw);
  for (let ty = 0; ty * t < h; ty++) {
    cnt.fill(0);
    const y1 = Math.min(h, (ty + 1) * t);
    for (let y = ty * t; y < y1; y++)
      for (let x = 0, i = y * w * 4; x < w; x++, i += 4) if (data[i] < DARK && data[i + 1] < DARK && data[i + 2] < DARK) cnt[(x / t) | 0]++;
    for (let k = 0; k < tw; k++) if (cnt[k] >= 0.4 * t * (y1 - ty * t)) return true;
  }
  return false;
}

/**
 * Dark boxes, found as connected dark shapes on a half-resolution grid (a cell is dark when all
 * its pixels are). A shape at least 6r on each side that fills 30% of its bounding box is a box:
 * it is kept with the light shapes it encloses that are thin in some direction (text lines, rules),
 * however tight the lines are; a large light panel inside a dark frame is still recoloured. Text
 * on paper is many small shapes and a table's rules fill little of their box, so neither qualifies.
 */
function addRegions(data: Uint8ClampedArray, a: Uint8Array, w: number, h: number, r: number): void {
  // Half resolution on full-size pages; thumbnails are too small to lose half their pixels.
  const k = r >= 4 ? 2 : 1;
  const cw = Math.ceil(w / k);
  const ch = Math.ceil(h / k);
  const n = cw * ch;
  const dark = new Uint8Array(n).fill(1);
  for (let y = 0, i = 0; y < h; y++) {
    const row = ((y / k) | 0) * cw;
    for (let x = 0; x < w; x++, i += 4) if (!(data[i] < DARK && data[i + 1] < DARK && data[i + 2] < DARK)) dark[row + ((x / k) | 0)] = 0;
  }
  const label = new Int32Array(n);
  const queue = new Int32Array(n);
  const keep = new Uint8Array(n);
  const seen = new Int32Array(n);
  const minSide = Math.max(4, Math.ceil((6 * r) / k));
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (!dark[start] || label[start]) continue;
    id++;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, count = 0;
    let head = 0, tail = 0;
    const grow = (c: number) => {
      label[c] = id;
      queue[tail++] = c;
    };
    const visit = (c: number) => {
      seen[c] = id;
      queue[tail++] = c;
    };
    grow(start);
    while (head < tail) {
      const c = queue[head++];
      const cx = c % cw;
      const cy = (c / cw) | 0;
      count++;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      if (cx > 0 && dark[c - 1] && !label[c - 1]) grow(c - 1);
      if (cx < cw - 1 && dark[c + 1] && !label[c + 1]) grow(c + 1);
      if (cy > 0 && dark[c - cw] && !label[c - cw]) grow(c - cw);
      if (cy < ch - 1 && dark[c + cw] && !label[c + cw]) grow(c + cw);
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (bw < minSide || bh < minSide || count < 0.3 * bw * bh) continue;
    // Keep the shape and the small light shapes it encloses (text, rules), not large light panels.
    const hole = Math.max(3, Math.ceil((6 * r) / k));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const c = y * cw + x;
        if (label[c] === id) {
          keep[c] = 1;
          continue;
        }
        if (seen[c] === id) continue;
        // One light shape inside the box: does it reach the box's edge, and how big is it?
        const hy0 = y; // the scan reaches a shape at its top row first
        let hx0 = x, hx1 = x, hy1 = y, open = false;
        head = tail = 0;
        visit(c);
        while (head < tail) {
          const q = queue[head++];
          const qx = q % cw;
          const qy = (q / cw) | 0;
          if (qx === x0 || qx === x1 || qy === y0 || qy === y1) open = true;
          if (qx < hx0) hx0 = qx;
          if (qx > hx1) hx1 = qx;
          if (qy > hy1) hy1 = qy;
          if (qx > x0 && label[q - 1] !== id && seen[q - 1] !== id) visit(q - 1);
          if (qx < x1 && label[q + 1] !== id && seen[q + 1] !== id) visit(q + 1);
          if (qy > y0 && label[q - cw] !== id && seen[q - cw] !== id) visit(q - cw);
          if (qy < y1 && label[q + cw] !== id && seen[q + cw] !== id) visit(q + cw);
        }
        if (open || (hx1 - hx0 + 1 > hole && hy1 - hy0 + 1 > hole)) continue;
        for (let i = 0; i < tail; i++) keep[queue[i]] = 1;
      }
  }
  if (!id) return;
  // Cells next to a kept cell: their dark pixels belong to the box's edge.
  const edge = new Uint8Array(n);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      if (!keep[cy * cw + cx]) continue;
      for (let y = Math.max(0, cy - 1); y <= Math.min(ch - 1, cy + 1); y++)
        for (let x = Math.max(0, cx - 1); x <= Math.min(cw - 1, cx + 1); x++) edge[y * cw + x] = 1;
    }
  const col = new Uint32Array(w);
  for (let x = 0; x < w; x++) col[x] = (x / k) | 0;
  for (let y = 0, j = 0; y < h; y++) {
    const row = ((y / k) | 0) * cw;
    for (let x = 0; x < w; x++, j++) {
      const c = row + col[x];
      if (keep[c]) a[j] = 1;
      else if (!a[j] && edge[c]) {
        const i = j << 2;
        if (data[i] < DARK && data[i + 1] < DARK && data[i + 2] < DARK) a[j] = 1;
      }
    }
  }
}

/**
 * One 1D box min (erode) or max (dilate) of radius `r` over rows or columns of a 0/1 mask.
 * Erosion only counts pixels inside the canvas, so areas touching the edge survive.
 */
function boxPass(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number, erode: boolean, rows: boolean): void {
  const len = rows ? w : h;
  const lines = rows ? h : w;
  const step = rows ? 1 : w;
  const sum = new Int32Array(len + 1);
  for (let l = 0; l < lines; l++) {
    const base = rows ? l * w : l;
    for (let k = 0; k < len; k++) sum[k + 1] = sum[k] + src[base + k * step];
    for (let k = 0; k < len; k++) {
      const lo = k - r < 0 ? 0 : k - r;
      const hi = k + r + 1 > len ? len : k + r + 1;
      const n = sum[hi] - sum[lo];
      dst[base + k * step] = erode ? (n === hi - lo ? 1 : 0) : n > 0 ? 1 : 0;
    }
  }
}

/**
 * True when the page is already dark (slides, dark-themed PDFs): more than half of a pixel sample is
 * dark. Such a page is left as it is at night; recolouring it would only flip its gaps to bright.
 */
export function isDarkPage(data: Uint8ClampedArray): boolean {
  const n = data.length >> 2;
  if (n === 0) return false;
  const step = n > 4096 ? 7 : 1;
  let dark = 0;
  let seen = 0;
  for (let j = 0; j < n; j += step, seen++) {
    const i = j << 2;
    if (data[i] < DARK && data[i + 1] < DARK && data[i + 2] < DARK) dark++;
  }
  return dark * 2 > seen;
}

/**
 * True for a picture that is really a page: a scan, or a figure or chart on white. Mostly light,
 * hardly any colour. Those are recoloured with the page, so a scanned book reads well at night;
 * photos keep their colours.
 */
export function paperLike(data: Uint8ClampedArray): boolean {
  const n = data.length >> 2;
  if (n === 0) return false;
  const step = n > 8192 ? 5 : 1;
  let light = 0;
  let colour = 0;
  let seen = 0;
  for (let j = 0; j < n; j += step, seen++) {
    const i = j << 2;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (min > 190) light++;
    if (max - min > 48) colour++;
  }
  return light >= seen * 0.55 && colour < seen * 0.08;
}

/** Half the thickness (in canvas px) a dark area needs to stay dark: 5pt at the given px per point. */
export const solidRadius = (pxPerPt: number) => Math.max(1, Math.round(5 * pxPerPt));

/**
 * Applies night mode to a drawn page canvas. `images` is pdf.js's `imageCoordinates`: per image three
 * corners (x0,y0 x1,y1 x2,y2, as fractions of the canvas) of the parallelogram it covers. Photos there
 * are copied back from the original (a little dimmed); scans and figures on white are recoloured.
 */
export async function applyNight(
  canvas: HTMLCanvasElement,
  images: ArrayLike<number> | null | undefined,
  cancelled?: () => boolean,
  solid = 0,
  o: NightOptions = DEFAULT_NIGHT,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;
  const { width: w, height: h } = canvas;
  const pixels = () => ctx.getImageData(0, 0, w, h).data;
  const first = pixels();
  if (isDarkPage(first)) return;
  const quads: number[][] = [];
  for (let i = 0; images && i + 5 < images.length; i += 6) {
    const [x0, y0, x1, y1, x2, y2] = [images[i] * w, images[i + 1] * h, images[i + 2] * w, images[i + 3] * h, images[i + 4] * w, images[i + 5] * h];
    // The fourth corner completes the parallelogram opposite (x0, y0).
    const q = [x0, y0, x1, y1, x1 + x2 - x0, y1 + y2 - y0, x2, y2];
    const b = quadsBox([q], w, h);
    if (b && !paperLike(ctx.getImageData(b.x, b.y, b.w, b.h).data)) quads.push(q);
  }
  // Only the area the photos cover is kept aside, not a second full-page bitmap.
  const box = quadsBox(quads, w, h);
  let original: HTMLCanvasElement | null = null;
  if (box) {
    original = document.createElement("canvas");
    original.width = box.w;
    original.height = box.h;
    original.getContext("2d")!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  }
  const data = await nightOffThread(first, w, solid, o).catch(() => {
    const d = pixels(); // the canvas is untouched until putImageData below
    nightPixels(d, w, solid, o);
    return d;
  });
  if (cancelled?.()) {
    if (original) original.width = original.height = 0;
    return;
  }
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  if (!original || !box) return;
  const dim = PHOTO_DIM[o.level] ?? 0;
  for (const q of quads) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q[0], q[1]);
    for (let k = 2; k < 8; k += 2) ctx.lineTo(q[k], q[k + 1]);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(original, box.x, box.y);
    if (dim > 0) {
      ctx.globalAlpha = dim;
      ctx.fillStyle = "black";
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  }
  original.width = original.height = 0;
}

/** Whole-pixel bounding box of the quads, clamped to the canvas; null when nothing is inside. */
export function quadsBox(quads: number[][], w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  if (!quads.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads)
    for (let k = 0; k < 8; k += 2) {
      x0 = Math.min(x0, q[k]);
      x1 = Math.max(x1, q[k]);
      y0 = Math.min(y0, q[k + 1]);
      y1 = Math.max(y1, q[k + 1]);
    }
  const x = Math.max(0, Math.floor(x0));
  const y = Math.max(0, Math.floor(y0));
  const bw = Math.min(w, Math.ceil(x1)) - x;
  const bh = Math.min(h, Math.ceil(y1)) - y;
  return bw > 0 && bh > 0 ? { x, y, w: bw, h: bh } : null;
}

// ---- Off the main thread ---------------------------------------------------

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve(buf: ArrayBuffer): void; reject(e: Error): void }>();

function nightWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./nightWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer }>) => {
      waiting.get(e.data.id)?.resolve(e.data.buf);
      waiting.delete(e.data.id);
    };
    // A broken worker: fall back to the main thread from now on, and fail the pages still
    // waiting (their pixels went to the worker) so the caller can redo them instead of hanging.
    worker.onerror = worker.onmessageerror = () => {
      worker?.terminate();
      worker = null;
      for (const w of waiting.values()) w.reject(new Error("night worker failed"));
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** nightPixels in a worker (the buffer is moved there and back, not copied); inline if workers fail. */
export async function nightOffThread(
  data: Uint8ClampedArray<ArrayBuffer>,
  width = 0,
  solid = 0,
  o: NightOptions = DEFAULT_NIGHT,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const w = typeof Worker === "undefined" ? null : nightWorker();
  if (!w) {
    nightPixels(data, width, solid, o);
    return data;
  }
  const id = nextId++;
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, buf: data.buffer, width, solid, o }, [data.buffer]);
  });
  return new Uint8ClampedArray(buf);
}
