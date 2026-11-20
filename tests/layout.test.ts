import { fitScale, rowScales, pageOffsets, spreadGroups, visiblePages } from "../src/reader/layout";

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

describe("rowScales", () => {
  const sizes = [{ w: 600, h: 800 }, { w: 1000, h: 700 }, { w: 600, h: 800 }];
  it("fits each page's own width, so a wide page fills the width too", () => {
    expect(rowScales([[1], [2], [3]], sizes, "width", 1, { w: 1200, h: 900 }, 10)).toEqual([2, 1.2, 2]);
  });
  it("uses the manual zoom for every row when not fitting", () => {
    expect(rowScales([[1], [2]], sizes, null, 1.5, { w: 1200, h: 900 }, 10)).toEqual([1.5, 1.5]);
  });
  it("keeps a lone cover in spread view at half the width", () => {
    const [cover, pair] = rowScales([[1], [2, 3]], [sizes[0], sizes[0], sizes[0]], "width", 1, { w: 1210, h: 900 }, 10, 2);
    expect(cover).toBe(1);
    expect(pair).toBe(1);
  });
});
