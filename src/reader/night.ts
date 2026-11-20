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
export function nightPixels(data: Uint8ClampedArray): void {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2);
  let last = -1;
  let lastOut = 0;
  for (let j = 0; j < words.length; j++) {
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

/**
 * Applies night mode to a drawn page canvas. `images` is pdf.js's `imageCoordinates`: per image three
 * corners (x0,y0 x1,y1 x2,y2, as fractions of the canvas) of the parallelogram it covers; those
 * areas are copied back from the original so photos and figures stay exactly as they were.
 */
export function applyNight(canvas: HTMLCanvasElement, images: ArrayLike<number> | null | undefined): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;
  const { width: w, height: h } = canvas;
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
  const img = ctx.getImageData(0, 0, w, h);
  nightPixels(img.data);
  ctx.putImageData(img, 0, 0);
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
