// Page-grid edits (pure). Items carry a stable key so selection survives reordering.
import type { PageSpec } from "./pages";

export type Item = { key: string; spec: PageSpec };

/** Moves the selected pages one step earlier (-1) or later (+1), keeping them together. */
export function moveSel(items: Item[], sel: Set<string>, dir: -1 | 1): Item[] {
  const out = [...items];
  const order = dir < 0 ? out.map((_, i) => i) : out.map((_, i) => out.length - 1 - i);
  for (const i of order) {
    const j = i + dir;
    if (!sel.has(out[i].key) || j < 0 || j >= out.length || sel.has(out[j].key)) continue;
    [out[i], out[j]] = [out[j], out[i]];
  }
  // A selected block already at the edge stays put (the swap above skips blocked items).
  return out;
}

export function rotateSel(items: Item[], sel: Set<string>, deg: number): Item[] {
  return items.map((it) =>
    sel.has(it.key) && "src" in it.spec ? { ...it, spec: { ...it.spec, rotate: (((it.spec.rotate + deg) % 360) + 360) % 360 } } : it,
  );
}

export const deleteSel = (items: Item[], sel: Set<string>): Item[] => items.filter((it) => !sel.has(it.key));

/** Inserts after the last selected page; with nothing selected, at the end. */
export function insertAfter(items: Item[], sel: Set<string>, add: Item[]): Item[] {
  let at = items.length;
  items.forEach((it, i) => {
    if (sel.has(it.key)) at = i + 1;
  });
  return [...items.slice(0, at), ...add, ...items.slice(at)];
}
