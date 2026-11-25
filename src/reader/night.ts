// Night mode for a rendered page: white paper turns near-black and black ink turns bright white,
// while coloured ink keeps its hue (dark blue becomes light blue). Pictures are put back untouched.

/** Darkest value the paper becomes; text goes up to pure white. */
const PAPER = 18;

/** Channel value after the shift, squeezed into PAPER..255. */
const SQUEEZE = Uint8ClampedArray.from({ length: 256 }, (_, v) => PAPER + (v * (255 - PAPER)) / 255);

/**
 * Inverts lightness in place, keeping hue: every channel shifts by 255 - (max + min), which mirrors
 * HSL lightness, then the result is squeezed into PAPER..255. Runs of identical pixels (paper,
 * solid fills) reuse the last result, so a text page costs little more than one pass of reads.
 */
export function nightPixels(data: Uint8ClampedArray, width = 0, solid = 0): void {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2);
  const keep = width > 0 && solid > 0 ? darkAreas(data, width, solid) : null;
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
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const shift = 255 - max - min;
    data[i] = SQUEEZE[r + shift];
    data[i + 1] = SQUEEZE[g + shift];
    data[i + 2] = SQUEEZE[b + shift];
    last = p;
    lastOut = words[j];
  }
}

/** A channel maximum below this counts as dark (fills, frames, bars). */
const DARK = 96;

/**
 * Pixels that already read as dark mode: dark areas thicker than `2 * r` px in both directions
 * (frames, bars, dark boxes), plus the light text inside them. Flipping those would put large
 * bright areas on a night page, so they keep their colours. Thin dark ink (text) is not included.
 * Morphological opening (drops thin ink) then closing (fills the text holes), with box filters.
 */
export function darkAreas(data: Uint8ClampedArray, w: number, r: number): Uint8Array {
  const h = Math.floor(data.length / 4 / w);
  const a = new Uint8Array(w * h);
  for (let j = 0, i = 0; j < a.length; j++, i += 4) a[j] = data[i] < DARK && data[i + 1] < DARK && data[i + 2] < DARK ? 1 : 0;
  const b = new Uint8Array(w * h);
  const pass = (rad: number, erode: boolean) => {
    boxPass(a, b, w, h, rad, erode, true);
    boxPass(b, a, w, h, rad, erode, false);
  };
  pass(r, true);
  pass(2 * r, false);
  pass(r, true);
  return a;
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

/** Half the thickness (in canvas px) a dark area needs to stay dark: 5pt at the given px per point. */
export const solidRadius = (pxPerPt: number) => Math.max(1, Math.round(5 * pxPerPt));

/**
 * Applies night mode to a drawn page canvas. `images` is pdf.js's `imageCoordinates`: per image three
 * corners (x0,y0 x1,y1 x2,y2, as fractions of the canvas) of the parallelogram it covers; those
 * areas are copied back from the original so photos and figures stay exactly as they were.
 */
export async function applyNight(
  canvas: HTMLCanvasElement,
  images: ArrayLike<number> | null | undefined,
  cancelled?: () => boolean,
  solid = 0,
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
    quads.push([x0, y0, x1, y1, x1 + x2 - x0, y1 + y2 - y0, x2, y2]);
  }
  // Only the area the pictures cover is kept aside, not a second full-page bitmap.
  const box = quadsBox(quads, w, h);
  let original: HTMLCanvasElement | null = null;
  if (box) {
    original = document.createElement("canvas");
    original.width = box.w;
    original.height = box.h;
    original.getContext("2d")!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  }
  const data = await nightOffThread(first, w, solid).catch(() => {
    const d = pixels(); // the canvas is untouched until putImageData below
    nightPixels(d, w, solid);
    return d;
  });
  if (cancelled?.()) {
    if (original) original.width = original.height = 0;
    return;
  }
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  if (!original || !box) return;
  for (const q of quads) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q[0], q[1]);
    for (let k = 2; k < 8; k += 2) ctx.lineTo(q[k], q[k + 1]);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(original, box.x, box.y);
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
export async function nightOffThread(data: Uint8ClampedArray<ArrayBuffer>, width = 0, solid = 0): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const w = typeof Worker === "undefined" ? null : nightWorker();
  if (!w) {
    nightPixels(data, width, solid);
    return data;
  }
  const id = nextId++;
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, buf: data.buffer, width, solid }, [data.buffer]);
  });
  return new Uint8ClampedArray(buf);
}
