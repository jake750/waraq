// Editor marks, in PDF user space (points, y up) of their page.

export type Pt = [number, number];
export type Rgb = [number, number, number]; // 0..1
/** x, y = bottom-left corner. */
export type Rect = { x: number; y: number; w: number; h: number };

type Base = { id: string; page: number };
/**
 * Optional look of drawn marks: `opacity` 0..1 (1 when missing; the highlighter pen is ink at 0.4),
 * `dash` a dashed stroke, and for boxes and ellipses `fill`, how strongly the inside is painted
 * in the mark's colour (0 or missing = empty, 1 = solid).
 */
export type Look = { opacity?: number; dash?: boolean };

export type Mark = Base &
  (
    | { kind: "highlight" | "underline" | "strike"; rects: Rect[]; color: Rgb; text?: string }
    | ({ kind: "ink"; paths: Pt[][]; color: Rgb; width: number } & Look)
    | ({ kind: "rect" | "ellipse"; a: Pt; b: Pt; color: Rgb; width: number; fill?: number } & Look)
    | ({ kind: "line" | "arrow"; a: Pt; b: Pt; color: Rgb; width: number } & Look)
    | { kind: "note"; at: Pt; text: string; color: Rgb }
    /** `at` = top-left of the box; lines wrap at `width`. */
    | { kind: "text"; at: Pt; width: number; text: string; size: number; color: Rgb; align: "start" | "center" | "end" }
    | { kind: "image"; box: Rect; bytes: Uint8Array; fmt: "png" | "jpg" }
  );

export type MarkKind = Mark["kind"];

export const COLORS: Record<string, Rgb> = {
  yellow: [1, 0.85, 0.2],
  green: [0.45, 0.85, 0.4],
  blue: [0.25, 0.5, 1],
  red: [0.9, 0.2, 0.2],
  black: [0.08, 0.09, 0.13],
};

export const css = ([r, g, b]: Rgb, a = 1) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

let seq = 0;
export const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** `#rrggbb` to and from a colour, for the custom colour picker. */
export const hexOf = (c: Rgb) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
export const rgbOf = (hex: string): Rgb => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
};
