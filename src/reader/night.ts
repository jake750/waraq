// Night mode for a rendered page: white paper turns near-black and black ink turns bright white,
// while coloured ink keeps its hue (dark blue becomes light blue). Pictures are put back untouched.

/** Darkest value the paper becomes; text goes up to pure white. */
const PAPER = 18;

/**
 * Inverts lightness in place, keeping hue: every channel shifts by 255 - (max + min), which mirrors
 * HSL lightness, then the result is squeezed into PAPER..255.
 */
export function nightPixels(data: Uint8ClampedArray): void {
  const k = (255 - PAPER) / 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const shift = 255 - max - min;
    data[i] = PAPER + (r + shift) * k;
    data[i + 1] = PAPER + (g + shift) * k;
    data[i + 2] = PAPER + (b + shift) * k;
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
  let original: HTMLCanvasElement | null = null;
  if (images && images.length >= 6) {
    original = document.createElement("canvas");
    original.width = w;
    original.height = h;
    original.getContext("2d")!.drawImage(canvas, 0, 0);
  }
  const img = ctx.getImageData(0, 0, w, h);
  nightPixels(img.data);
  ctx.putImageData(img, 0, 0);
  if (!original || !images) return;
  for (let i = 0; i + 5 < images.length; i += 6) {
    const [x0, y0, x1, y1, x2, y2] = [images[i] * w, images[i + 1] * h, images[i + 2] * w, images[i + 3] * h, images[i + 4] * w, images[i + 5] * h];
    // The fourth corner completes the parallelogram opposite (x0, y0).
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + x2 - x0, y1 + y2 - y0);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(original, 0, 0);
    ctx.restore();
  }
  original.width = original.height = 0;
}
