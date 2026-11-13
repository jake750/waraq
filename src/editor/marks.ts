// Editor marks, in PDF user space (points, y up) of their page.

export type Pt = [number, number];
export type Rgb = [number, number, number]; // 0..1
/** x, y = bottom-left corner. */
export type Rect = { x: number; y: number; w: number; h: number };

type Base = { id: string; page: number };

export type Mark = Base &
  (
    | { kind: "highlight" | "underline" | "strike"; rects: Rect[]; color: Rgb; text?: string }
    | { kind: "ink"; paths: Pt[][]; color: Rgb; width: number }
    | { kind: "rect" | "ellipse" | "line" | "arrow"; a: Pt; b: Pt; color: Rgb; width: number }
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
