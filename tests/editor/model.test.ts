import { visualRuns } from "../../src/editor/bidi";
import { emptyHistory, historyReduce } from "../../src/editor/history";
import type { Mark } from "../../src/editor/marks";

const ink = (id: string): Mark => ({ id, page: 0, kind: "ink", paths: [[[0, 0], [1, 1]]], color: [0, 0, 0], width: 2 });

test("undo and redo", () => {
  let h = historyReduce(emptyHistory, { type: "add", mark: ink("a") });
  h = historyReduce(h, { type: "add", mark: ink("b") });
  h = historyReduce(h, { type: "undo" });
  expect(h.present.map((m) => m.id)).toEqual(["a"]);
  h = historyReduce(h, { type: "redo" });
  expect(h.present.map((m) => m.id)).toEqual(["a", "b"]);
});

test("a new edit clears redo", () => {
  let h = historyReduce(emptyHistory, { type: "add", mark: ink("a") });
  h = historyReduce(h, { type: "undo" });
  h = historyReduce(h, { type: "add", mark: ink("c") });
  expect(h.future).toEqual([]);
  expect(historyReduce(h, { type: "redo" }).present.map((m) => m.id)).toEqual(["c"]);
});

test("update and remove are undoable; undo at the start does nothing", () => {
  let h = historyReduce(emptyHistory, { type: "add", mark: ink("a") });
  h = historyReduce(h, { type: "update", id: "a", patch: { width: 5 } });
  expect((h.present[0] as Extract<Mark, { kind: "ink" }>).width).toBe(5);
  h = historyReduce(h, { type: "remove", id: "a" });
  expect(h.present).toEqual([]);
  h = historyReduce(historyReduce(h, { type: "undo" }), { type: "undo" });
  expect((h.present[0] as Extract<Mark, { kind: "ink" }>).width).toBe(2);
  expect(historyReduce(emptyHistory, { type: "undo" })).toBe(emptyHistory);
});

const runs = (s: string, dir?: "ltr" | "rtl") => visualRuns(s, dir).map((r) => [r.text, r.rtl]);

test("bidi: plain arabic is one rtl run", () => expect(runs("مرحبا بالعالم")).toEqual([["مرحبا بالعالم", true]]));

test("bidi: arabic word inside english", () =>
  expect(runs("Hello مرحبا world")).toEqual([
    ["Hello ", false],
    ["مرحبا", true],
    [" world", false],
  ]));

test("bidi: latin inside arabic is placed in visual order", () =>
  expect(runs("ملف PDF جديد")).toEqual([
    [" جديد", true],
    ["PDF", false],
    ["ملف ", true],
  ]));

test("bidi: separate numbers in arabic keep reading order", () =>
  expect(runs("ورق 10 50")).toEqual([
    ["50", false],
    [" ", true],
    ["10", false],
    ["ورق ", true],
  ]));

test("bidi: harakat stay with their letter", () => expect(runs("كَتَبَ")).toEqual([["كَتَبَ", true]]));

test("bidi: forced rtl paragraph", () =>
  expect(runs("123 abc", "rtl")).toEqual([
    ["abc", false],
    [" ", true],
    ["123", false],
  ]));

test("reorder moves a mark to the front or back, undoably; a no-op leaves history alone", () => {
  let h = historyReduce(emptyHistory, { type: "add", mark: ink("a") });
  h = historyReduce(h, { type: "add", mark: ink("b") });
  h = historyReduce(h, { type: "reorder", id: "a", to: "front" });
  expect(h.present.map((m) => m.id)).toEqual(["b", "a"]);
  expect(historyReduce(h, { type: "reorder", id: "a", to: "front" })).toBe(h);
  h = historyReduce(h, { type: "reorder", id: "a", to: "back" });
  expect(h.present.map((m) => m.id)).toEqual(["a", "b"]);
  expect(historyReduce(h, { type: "undo" }).present.map((m) => m.id)).toEqual(["b", "a"]);
});

test("removeMany drops several marks in one undoable step", () => {
  let h = historyReduce(emptyHistory, { type: "add", mark: ink("a") });
  h = historyReduce(h, { type: "add", mark: ink("b") });
  h = historyReduce(h, { type: "add", mark: ink("c") });
  h = historyReduce(h, { type: "removeMany", ids: ["a", "c"] });
  expect(h.present.map((m) => m.id)).toEqual(["b"]);
  expect(historyReduce(h, { type: "removeMany", ids: ["x"] })).toBe(h);
  expect(historyReduce(h, { type: "undo" }).present.map((m) => m.id)).toEqual(["a", "b", "c"]);
});

test("hexOf and rgbOf round-trip; markExcerpt shortens", async () => {
  const { hexOf, rgbOf } = await import("../../src/editor/marks");
  expect(hexOf([1, 0.5, 0])).toBe("#ff8000");
  expect(hexOf(rgbOf("#1f4fd1"))).toBe("#1f4fd1");
  expect(rgbOf("nope")).toEqual([0, 0, 0]);
  const { markExcerpt } = await import("../../src/editor/MarksPanel");
  expect(markExcerpt({ id: "n", page: 0, kind: "note", at: [0, 0], text: "a\n  b", color: [1, 1, 0] })).toBe("a b");
  expect(markExcerpt({ id: "n", page: 0, kind: "note", at: [0, 0], text: "x".repeat(100), color: [1, 1, 0] }, 10)).toBe("xxxxxxxxx…");
});

test("addMany and updateMany are single undo steps", () => {
  let h = historyReduce(emptyHistory, { type: "addMany", marks: [ink("a"), ink("b")] });
  expect(h.past.length).toBe(1);
  h = historyReduce(h, { type: "updateMany", patches: [{ id: "a", patch: { width: 7 } }, { id: "b", patch: { width: 8 } }] });
  expect(h.present.map((m) => (m as Extract<Mark, { kind: "ink" }>).width)).toEqual([7, 8]);
  expect(historyReduce(h, { type: "undo" }).present.map((m) => (m as Extract<Mark, { kind: "ink" }>).width)).toEqual([2, 2]);
  expect(historyReduce(h, { type: "addMany", marks: [] })).toBe(h);
});
