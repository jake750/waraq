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
