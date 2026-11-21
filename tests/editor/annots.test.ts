// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { PDFArray, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { importAnnots, parseDA, quadRects, rgbOfArray } from "../../src/editor/annots";
import { writeMarks, type EditorFonts } from "../../src/editor/write";
import type { Mark } from "../../src/editor/marks";

const woff = (s: string) => new Uint8Array(readFileSync(`node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-${s}-400-normal.woff`));
const fonts: EditorFonts = { arabic: woff("arabic"), latin: woff("latin") };
const blank = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  return pdf.save();
};
const strip = (m: Mark) => ({ ...m, id: "" });
const annotCount = async (b: Uint8Array) => {
  const a = (await PDFDocument.load(b)).getPage(0).node.lookup(PDFName.of("Annots"));
  return a instanceof PDFArray ? a.size() : 0;
};

const c = [0.9, 0.2, 0.2] as [number, number, number];
const marks: Mark[] = [
  { id: "h", page: 0, kind: "highlight", rects: [{ x: 50, y: 700, w: 100, h: 14 }], text: "hello", color: [1, 0.85, 0.2] },
  { id: "s", page: 0, kind: "strike", rects: [{ x: 50, y: 660, w: 100, h: 14 }], color: c },
  { id: "i", page: 0, kind: "ink", paths: [[[10, 10], [50, 60], [90, 20]]], color: c, width: 3, opacity: 0.4 },
  { id: "r", page: 0, kind: "rect", a: [100, 100], b: [200, 150], color: c, width: 2, fill: 0.25, dash: true },
  { id: "e", page: 0, kind: "ellipse", a: [100, 200], b: [200, 260], color: c, width: 6 },
  { id: "l", page: 0, kind: "arrow", a: [300, 100], b: [400, 180], color: c, width: 2 },
  { id: "n", page: 0, kind: "note", at: [500, 700], text: "ملاحظة", color: [1, 0.85, 0.2] },
];

test("marks saved by the editor come back as the same marks, and leave the file", async () => {
  const saved = await writeMarks(await blank(), marks, fonts, { flatten: false });
  const { bytes, marks: back } = await importAnnots(saved);
  expect(back.map(strip)).toEqual(marks.map(strip));
  expect(await annotCount(bytes)).toBe(0);
  // Writing them again gives the same file content as before (nothing doubled).
  expect(await annotCount(await writeMarks(bytes, back, fonts, { flatten: false }))).toBe(marks.length);
});

test("other readers' annotations: no RD, gray colours, FreeText; links and popups handled", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const ctx = pdf.context;
  const popup = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Popup", Rect: [0, 0, 10, 10] }));
  const sq = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [10, 10, 110, 60], C: [0.5], BS: { W: 4 }, Popup: popup }));
  const ft = ctx.register(ctx.obj({ Type: "Annot", Subtype: "FreeText", Rect: [100, 600, 300, 640], Contents: PDFString.of("Typed"), DA: PDFString.of("/Helv 14 Tf 0 0 1 rg"), Q: 1 }));
  const link = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 5, 5] }));
  const hidden = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [0, 0, 50, 50], F: 2 }));
  page.node.set(PDFName.of("Annots"), ctx.obj([sq, popup, ft, link, hidden]));
  const { bytes, marks: back } = await importAnnots(await pdf.save());
  expect(back.map(strip)).toEqual([
    { id: "", page: 0, kind: "rect", a: [12, 12], b: [108, 58], color: [0.5, 0.5, 0.5], width: 4 },
    { id: "", page: 0, kind: "text", at: [102, 638], width: 196, text: "Typed", size: 14, color: [0, 0, 1], align: "center" },
  ]);
  expect(await annotCount(bytes)).toBe(2); // the link and the hidden square stay
});

test("a file with nothing to edit is passed through as is", async () => {
  const b = await blank();
  expect((await importAnnots(b)).bytes).toBe(b);
  const junk = new Uint8Array([1, 2, 3]);
  expect(await importAnnots(junk)).toEqual({ bytes: junk, marks: [] });
});

test("helpers", () => {
  expect(rgbOfArray([0, 0, 0, 1])).toEqual([0, 0, 0]);
  expect(rgbOfArray([])).toBeUndefined();
  expect(parseDA("0.2 g /Helv 9 Tf")).toEqual({ size: 9, color: [0.2, 0.2, 0.2] });
  expect(quadRects([10, 20, 30, 20, 10, 5, 30, 5])).toEqual([{ x: 10, y: 5, w: 20, h: 15 }]);
});
