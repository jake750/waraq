// Undo/redo for the whole editing session: every change pushes the previous mark list.
import type { Mark } from "./marks";

export type History = { past: Mark[][]; present: Mark[]; future: Mark[][] };
export type HistoryAction =
  | { type: "add"; mark: Mark }
  | { type: "update"; id: string; patch: Partial<Mark> }
  | { type: "remove"; id: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; marks?: Mark[] };

export const emptyHistory: History = { past: [], present: [], future: [] };

const commit = (h: History, present: Mark[]): History => ({ past: [...h.past, h.present], present, future: [] });

export function historyReduce(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "add":
      return commit(h, [...h.present, a.mark]);
    case "update":
      return commit(
        h,
        h.present.map((m) => (m.id === a.id ? ({ ...m, ...a.patch } as Mark) : m)),
      );
    case "remove":
      return h.present.some((m) => m.id === a.id) ? commit(h, h.present.filter((m) => m.id !== a.id)) : h;
    case "undo":
      return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
    case "redo":
      return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
    case "reset":
      return { past: [], present: a.marks ?? [], future: [] };
  }
}
