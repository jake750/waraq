import { charIndexAt, selectText, moveMark, fitBox, resizeBox } from "../../src/editor/geometry";
import type { PageLayout } from "../../src/text/search";
import type { Mark } from "../../src/editor/marks";

// Two lines of RTL text: logical order runs right→left on each line.
// Line 1 "ابج" at y=700, line 2 "دهو" at y=680; each letter 10pt wide.
const layout: PageLayout = {
  text: "ابج\nدهو",
  boxes: [
    { x: 120, y: 700, w: 10, h: 12 },
    { x: 110, y: 700, w: 10, h: 12 },
    { x: 100, y: 700, w: 10, h: 12 },
    { x: 100, y: 700, w: 0, h: 12 },
    { x: 120, y: 680, w: 10, h: 12 },
    { x: 110, y: 680, w: 10, h: 12 },
    { x: 100, y: 680, w: 10, h: 12 },
  ],
};

test("the character under a point, or the nearest one on that line", () => {
  expect(charIndexAt(layout, [125, 705])).toBe(0);
  expect(charIndexAt(layout, [103, 686])).toBe(6);
  expect(charIndexAt(layout, [200, 705])).toBe(0); // past the line's end, same line
  expect(charIndexAt(layout, [115, 690])).toBeGreaterThanOrEqual(0);
  expect(charIndexAt({ text: "", boxes: [] }, [0, 0])).toBe(-1);
});

test("a drag selects in reading order, one rect per line", () => {
  const s = selectText(layout, [125, 705], [115, 685])!;
  expect(s.text).toBe("ابج\nده");
  expect(s.rects).toEqual([
    { x: 100, y: 700, w: 30, h: 12 },
    { x: 110, y: 680, w: 20, h: 12 },
  ]);
  // dragging backwards selects the same text
  expect(selectText(layout, [115, 685], [125, 705])!.text).toBe("ابج\nده");
  expect(selectText({ text: "", boxes: [] }, [0, 0], [1, 1])).toBeNull();
});

test("moving a mark shifts every point it has", () => {
  const ink: Mark = { id: "a", page: 0, kind: "ink", paths: [[[0, 0], [10, 10]]], color: [0, 0, 0], width: 2 };
  expect(moveMark(ink, 5, -5)).toMatchObject({ paths: [[[5, -5], [15, 5]]] });
  const hl: Mark = { id: "b", page: 0, kind: "highlight", rects: [{ x: 1, y: 2, w: 3, h: 4 }], color: [1, 1, 0] };
  expect(moveMark(hl, 1, 1)).toMatchObject({ rects: [{ x: 2, y: 3, w: 3, h: 4 }] });
  const r: Mark = { id: "c", page: 0, kind: "rect", a: [0, 0], b: [5, 5], color: [0, 0, 0], width: 1 };
  expect(moveMark(r, 1, 2)).toMatchObject({ a: [1, 2], b: [6, 7] });
  const t: Mark = { id: "d", page: 0, kind: "text", at: [10, 10], width: 50, text: "x", size: 12, color: [0, 0, 0], align: "start" };
  expect(moveMark(t, -1, -1)).toMatchObject({ at: [9, 9] });
  const img: Mark = { id: "e", page: 0, kind: "image", box: { x: 0, y: 0, w: 4, h: 2 }, bytes: new Uint8Array(), fmt: "png" };
  expect(moveMark(img, 2, 2)).toMatchObject({ box: { x: 2, y: 2, w: 4, h: 2 } });
});

test("an image is fitted inside the limit, centred on a point, aspect kept", () => {
  expect(fitBox(400, 200, 100, 100, [50, 50])).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  expect(fitBox(20, 10, 100, 100, [50, 50])).toEqual({ x: 40, y: 45, w: 20, h: 10 }); // never enlarged
});

test("resizing from the corner keeps the aspect ratio and the opposite corner", () => {
  // box bottom-left (0,0) 40×20; its top-left (0,20) stays; dragging the bottom-right corner to x=80
  expect(resizeBox({ x: 0, y: 0, w: 40, h: 20 }, 80)).toEqual({ x: 0, y: -20, w: 80, h: 40 });
  expect(resizeBox({ x: 0, y: 0, w: 40, h: 20 }, 2).w).toBe(8); // a minimum size
});
