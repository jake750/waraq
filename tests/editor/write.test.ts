// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, degrees } from "pdf-lib";
import { writeMarks, type EditorFonts } from "../../src/editor/write";
import type { Mark } from "../../src/editor/marks";
import { openPdf } from "../../src/pdf/openPdf";
import { pageText } from "../../src/text/search";
import { fx, withOrientation } from "../helpers";

const woff = (s: string) => new Uint8Array(readFileSync(`node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-${s}-400-normal.woff`));
const fonts: EditorFonts = { arabic: woff("arabic"), latin: woff("latin") };

async function blank(rotate = 0): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]).setRotation(degrees(rotate));
  return pdf.save();
}
const subtypes = async (b: Uint8Array) => {
  const page = (await PDFDocument.load(b)).getPage(0);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  return annots ? annots.asArray().map((r) => String(page.doc.context.lookup(r)?.toString().match(/\/Subtype \/(\w+)/)?.[1])) : [];
};

const base = { page: 0, color: [1, 0.85, 0.2] as [number, number, number] };
const all: Mark[] = [
  { ...base, id: "h", kind: "highlight", rects: [{ x: 50, y: 700, w: 100, h: 14 }], text: "x" },
  { ...base, id: "u", kind: "underline", rects: [{ x: 50, y: 680, w: 100, h: 14 }] },
  { ...base, id: "s", kind: "strike", rects: [{ x: 50, y: 660, w: 100, h: 14 }] },
  { ...base, id: "i", kind: "ink", paths: [[[10, 10], [50, 60], [90, 20]]], width: 2 },
  { ...base, id: "r", kind: "rect", a: [100, 100], b: [200, 150], width: 2 },
  { ...base, id: "e", kind: "ellipse", a: [100, 200], b: [200, 260], width: 2 },
  { ...base, id: "l", kind: "arrow", a: [300, 100], b: [400, 180], width: 2 },
  { ...base, id: "n", kind: "note", at: [500, 700], text: "ملاحظة مهمة" },
  { id: "img", page: 0, kind: "image", box: { x: 300, y: 300, w: 60, h: 40 }, bytes: fx("office/sample.png"), fmt: "png" },
];

test("each mark becomes its standard annotation, with an appearance", async () => {
  const out = await writeMarks(await blank(), all, fonts, { flatten: false });
  expect(await subtypes(out)).toEqual(["Highlight", "Underline", "StrikeOut", "Ink", "Square", "Circle", "Line", "Text", "Stamp"]);
  const doc = await openPdf(out);
  const annots = await (await doc.getPage(1)).getAnnotations();
  expect(annots.every((a) => a.hasAppearance || a.subtype === "Text")).toBe(true);
  expect(annots.find((a) => a.subtype === "Text")?.contentsObj?.str).toBe("ملاحظة مهمة");
});

test("flatten draws everything into the page and leaves only notes", async () => {
  const out = await writeMarks(await blank(), all, fonts, { flatten: true });
  expect(await subtypes(out)).toEqual(["Text"]);
});

test("the input bytes are not changed", async () => {
  const input = await blank();
  const copy = input.slice();
  await writeMarks(input, all, fonts, { flatten: true });
  expect(input).toEqual(copy);
});

const text = (t: string, width = 400): Extract<Mark, { kind: "text" }> => ({ id: "t", page: 0, kind: "text", at: [50, 750], width, text: t, size: 16, color: [0, 0, 0], align: "start" });

test("an arabic/english text box reads back in logical order", async () => {
  const out = await writeMarks(await blank(), [text("ملف PDF جديد رقم 10")], fonts, { flatten: false });
  expect(await pageText(await openPdf(out), 0)).toBe("ملف PDF جديد رقم 10");
});

test("long text wraps to the box width and keeps lines in order", async () => {
  const out = await writeMarks(await blank(), [text("الكتاب صديق لا يمل يفتح لك أبوابه كلما عدت إليه", 120)], fonts, { flatten: false });
  const t = await pageText(await openPdf(out), 0);
  expect(t.split("\n").length).toBeGreaterThan(1);
  expect(t.replace(/\n/g, " ")).toBe("الكتاب صديق لا يمل يفتح لك أبوابه كلما عدت إليه");
});

test("text on a rotated page runs along the displayed page, upright", async () => {
  const out = await writeMarks(await blank(90), [{ ...text("Hello مرحبا"), at: [100, 100] }], fonts, { flatten: false });
  const doc = await openPdf(out);
  const items = (await (await doc.getPage(1)).getTextContent()).items as { str: string; transform: number[] }[];
  const drawn = items.filter((i) => i.str.trim());
  // Page /Rotate 90: "right" on screen is +y in PDF space, so glyphs are rotated 90° and advance along y.
  expect(drawn.every((i) => Math.abs(i.transform[0]) < 0.01 && i.transform[1] > 0)).toBe(true);
  const byY = [...drawn].sort((a, b) => a.transform[5] - b.transform[5]);
  expect(byY[0].str).toContain("Hello");
  expect(byY.map((i) => i.transform[4]).every((x) => Math.abs(x - byY[0].transform[4]) < 0.01)).toBe(true);
});

test("protected PDFs are refused", async () => {
  await expect(writeMarks(fx("password.pdf"), all, fonts, { flatten: false })).rejects.toMatchObject({ code: "protected" });
});

test("a sideways-stored phone photo is drawn turned upright into its box", async () => {
  const photo: Mark = { id: "p", page: 0, kind: "image", box: { x: 300, y: 300, w: 60, h: 40 }, bytes: withOrientation(6), fmt: "jpg" };
  const out = await writeMarks(await blank(), [photo], fonts, { flatten: false });
  const page = (await PDFDocument.load(out)).getPage(0);
  const annot = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)!.lookup(0, PDFDict);
  const ap = annot.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N")) as PDFRawStream;
  expect(new TextDecoder().decode(ap.getContents())).toContain("0 -40 60 0 300 340 cm");
});

test("pen strokes are saved as the same smooth curve the editor shows", async () => {
  const ink: Mark = { ...base, id: "i", kind: "ink", paths: [[[10, 10], [50, 60], [90, 20], [130, 70]]], width: 2 };
  const out = await writeMarks(await blank(), [ink], fonts, { flatten: false });
  const page = (await PDFDocument.load(out)).getPage(0);
  const annot = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)!.lookup(0, PDFDict);
  const ap = annot.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N")) as PDFRawStream;
  const content = new TextDecoder().decode(ap.getContents());
  expect(content).toMatch(/^.*10 10 m .* c .* 130 70 c S/);
  expect(content).not.toMatch(/ l S/);
});
