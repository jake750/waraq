import { fitScale, pageOffsets, spreadGroups, visiblePages } from "../src/reader/layout";

test("offsets", () => expect(pageOffsets([100, 100, 100], 10)).toEqual([0, 110, 220]));

test("visible", () => {
  const h = [100, 100, 100, 100, 100];
  expect(visiblePages(150, 100, h, 10, 0)).toEqual([1, 2]);
  expect(visiblePages(150, 100, h, 10, 1)).toEqual([0, 1, 2, 3]);
  expect(visiblePages(0, 50, h, 10, 2)).toEqual([0, 1, 2]);
});

test("500 pages keeps the window small", () =>
  expect(visiblePages(400_000, 900, Array(500).fill(1100), 12, 2).length).toBeLessThanOrEqual(6));

test("spreads", () => {
  expect(spreadGroups(5, true)).toEqual([[1], [2, 3], [4, 5]]);
  expect(spreadGroups(4, false)).toEqual([[1, 2], [3, 4]]);
  expect(spreadGroups(1, true)).toEqual([[1]]);
});

test("fit", () => {
  expect(fitScale("width", { w: 600, h: 800 }, { w: 1200, h: 800 })).toBe(2);
  expect(fitScale("page", { w: 600, h: 800 }, { w: 1200, h: 800 })).toBe(1);
});
