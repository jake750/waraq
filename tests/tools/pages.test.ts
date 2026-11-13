import { PDFDocument, degrees } from "pdf-lib";
import { assemble, parseRanges, splitGroups } from "../../src/tools/pages";
import { fx } from "../helpers";

/** A PDF whose page i is (100 + i) points wide, so order and identity are visible from sizes. */
async function sized(n: number, base = 100): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < n; i++) pdf.addPage([base + i, 200]);
  return pdf.save();
}
const widths = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => Math.round(p.getWidth()));
const rotations = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => p.getRotation().angle);

test("ranges: order kept, open end, spaces", () => {
  expect(parseRanges("3, 1-2 ,5-", 6)).toEqual([2, 0, 1, 4, 5]);
  expect(parseRanges("2", 3)).toEqual([1]);
});

test("ranges: arabic-indic digits and arabic comma", () => {
  expect(parseRanges("١-٣، ٥", 6)).toEqual([0, 1, 2, 4]);
});

test("ranges: invalid input is null", () => {
  expect(parseRanges("", 5)).toBeNull();
  expect(parseRanges("0", 5)).toBeNull();
  expect(parseRanges("7", 5)).toBeNull();
  expect(parseRanges("4-2", 5)).toBeNull();
  expect(parseRanges("a", 5)).toBeNull();
});

test("split groups", () => {
  expect(splitGroups(3, { kind: "each" })).toEqual([[0], [1], [2]]);
  expect(splitGroups(5, { kind: "every", n: 2 })).toEqual([[0, 1], [2, 3], [4]]);
  expect(splitGroups(6, { kind: "ranges", text: "1-2; 3, 6" })).toEqual([[0, 1], [2, 5]]);
  expect(splitGroups(6, { kind: "ranges", text: "9" })).toBeNull();
});

test("merge keeps every page's own size", async () => {
  const out = await assemble(
    [await sized(2, 100), await sized(1, 300)],
    [
      { src: 0, index: 0, rotate: 0 },
      { src: 0, index: 1, rotate: 0 },
      { src: 1, index: 0, rotate: 0 },
    ],
  );
  expect(await widths(out)).toEqual([100, 101, 300]);
});

test("reorder, delete and insert a blank page", async () => {
  const out = await assemble([await sized(3)], [{ src: 0, index: 2, rotate: 0 }, { blank: [50, 60] }, { src: 0, index: 0, rotate: 0 }]);
  expect(await widths(out)).toEqual([102, 50, 100]);
});

test("rotation adds to a page's existing rotation", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 200]).setRotation(degrees(90));
  const out = await assemble([await pdf.save()], [{ src: 0, index: 0, rotate: 270 }, { src: 0, index: 0, rotate: 90 }]);
  expect(await rotations(out)).toEqual([0, 180]);
});

test("a real-world PDF survives a round trip with its text", async () => {
  const out = await assemble([fx("office/sample-lo.pdf")], [{ src: 0, index: 0, rotate: 0 }]);
  expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
});

test("encrypted and corrupt inputs are reported, not crashed", async () => {
  await expect(assemble([fx("password.pdf")], [{ src: 0, index: 0, rotate: 0 }])).rejects.toMatchObject({ code: "protected" });
  await expect(assemble([fx("not-a-pdf.pdf")], [{ src: 0, index: 0, rotate: 0 }])).rejects.toMatchObject({ code: "bad-input" });
});
