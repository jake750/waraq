import { deleteSel, insertAfter, moveSel, rotateSel, type Item } from "../../src/tools/organize";

const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, spec: { src: 0, index: i, rotate: 0 } }));
const idx = (xs: Item[]) => xs.map((x) => ("index" in x.spec ? x.spec.index : "b"));

test("move selected pages earlier and later as a block", () => {
  expect(idx(moveSel(items(5), new Set(["k2", "k3"]), -1))).toEqual([0, 2, 3, 1, 4]);
  expect(idx(moveSel(items(5), new Set(["k1"]), 1))).toEqual([0, 2, 1, 3, 4]);
  expect(idx(moveSel(items(3), new Set(["k0"]), -1))).toEqual([0, 1, 2]);
  expect(idx(moveSel(items(3), new Set(["k2"]), 1))).toEqual([0, 1, 2]);
});

test("rotate only selected pages, wrapping at 360", () => {
  const r = rotateSel(rotateSel(items(2), new Set(["k1"]), 270), new Set(["k1"]), 180);
  expect(r.map((x) => ("rotate" in x.spec ? x.spec.rotate : 0))).toEqual([0, 90]);
});

test("delete selected", () => {
  expect(idx(deleteSel(items(4), new Set(["k0", "k2"])))).toEqual([1, 3]);
});

test("insert after the last selected page, or at the end", () => {
  const blank: Item = { key: "b", spec: { blank: [10, 10] } };
  expect(idx(insertAfter(items(3), new Set(["k0"]), [blank]))).toEqual([0, "b", 1, 2]);
  expect(idx(insertAfter(items(2), new Set(), [blank]))).toEqual([0, 1, "b"]);
});
