/**
 * A canvas for pdf.js to draw a page into. pdf.js draws each glyph with fillText, and the 2D
 * context's direction defaults to "inherit": under the Arabic UI (dir="rtl") the browser would
 * reorder and reshape the PDF's glyph runs, leaving Arabic text as disconnected, reversed letters.
 * A page's glyph positions are already final, so its canvas is always left-to-right.
 */
export function pageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.dir = "ltr";
  return canvas;
}
