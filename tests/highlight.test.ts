import { matchRects } from "../src/reader/highlight";

const box = (x: number, y: number, w = 10) => ({ x, y, w, h: 12 });

test("one rect per line, union of the letters", () => {
  // "ab\ncd": a,b on line y=700; c,d on y=680
  const layout = { text: "ab\ncd", boxes: [box(0, 700), box(10, 700), box(10, 700, 0), box(0, 680), box(10, 680)] };
  expect(matchRects(layout, { page: 0, start: 0, end: 5 }, true)).toEqual([
    { x: 0, y: 700, w: 20, h: 12, current: true },
    { x: 0, y: 680, w: 20, h: 12, current: true },
  ]);
});

test("rtl letters (x decreasing) still give the right extent", () => {
  const layout = { text: "كتاب", boxes: [box(30, 700), box(20, 700), box(10, 700), box(0, 700)] };
  expect(matchRects(layout, { page: 0, start: 1, end: 3 }, false)).toEqual([{ x: 10, y: 700, w: 20, h: 12, current: false }]);
});
