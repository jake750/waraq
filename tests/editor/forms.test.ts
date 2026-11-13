// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { listFields, fillFields } from "../../src/editor/forms";
import type { EditorFonts } from "../../src/editor/write";
import { openPdf } from "../../src/pdf/openPdf";
import { fx } from "../helpers";

const woff = (s: string) => new Uint8Array(readFileSync(`node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-${s}-400-normal.woff`));
const fonts: EditorFonts = { arabic: woff("arabic"), latin: woff("latin") };

async function form(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const f = pdf.getForm();
  f.createTextField("name").addToPage(page, { x: 50, y: 700, width: 300, height: 24 });
  f.createCheckBox("agree").addToPage(page, { x: 50, y: 650, width: 16, height: 16 });
  const city = f.createDropdown("city");
  city.addOptions(["Tunis", "Sfax", "صفاقس"]);
  city.addToPage(page, { x: 50, y: 600, width: 200, height: 24 });
  const size = f.createRadioGroup("size");
  size.addOptionToPage("S", page, { x: 50, y: 550, width: 16, height: 16 });
  size.addOptionToPage("L", page, { x: 80, y: 550, width: 16, height: 16 });
  return pdf.save();
}

test("lists every field with its kind, options and page", async () => {
  const fields = await listFields(await form());
  expect(fields.map((f) => [f.name, f.kind])).toEqual([
    ["name", "text"],
    ["agree", "check"],
    ["city", "dropdown"],
    ["size", "radio"],
  ]);
  expect(fields.find((f) => f.name === "city")?.options).toEqual(["Tunis", "Sfax", "صفاقس"]);
  expect(fields.find((f) => f.name === "size")?.options).toEqual(["S", "L"]);
  expect(fields.every((f) => f.page === 0)).toBe(true);
});

test("a PDF without a form has no fields", async () => {
  expect(await listFields(fx("office/sample-lo.pdf"))).toEqual([]);
});

test("filled values read back, Arabic included", async () => {
  const out = await fillFields(await form(), { name: "فراس Ben Ali", agree: true, city: "صفاقس", size: "L" }, fonts, { flatten: false });
  const back = Object.fromEntries((await listFields(out)).map((f) => [f.name, f.value]));
  expect(back).toEqual({ name: "فراس Ben Ali", agree: true, city: "صفاقس", size: "L" });
  const annots = await (await (await openPdf(out)).getPage(1)).getAnnotations();
  expect(annots.find((a) => a.fieldName === "name")?.hasAppearance).toBe(true);
});

test("flatten burns the values into the page and removes the fields", async () => {
  const out = await fillFields(await form(), { name: "مرحبا" }, fonts, { flatten: true });
  expect(await listFields(out)).toEqual([]);
  const doc = await openPdf(out);
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join("");
  expect(text).toContain("مرحبا");
});

test("the input is not changed", async () => {
  const input = await form();
  const copy = input.slice();
  await fillFields(input, { name: "x" }, fonts, { flatten: true });
  expect(input).toEqual(copy);
});

test("flatten keeps going when a field has no appearance of its own", async () => {
  const pdf = await PDFDocument.load(await form());
  // An untouched field whose widget lost its /AP, as some generators write them.
  pdf.getForm().getField("city").acroField.getWidgets()[0].dict.delete(PDFName.of("AP"));
  const out = await fillFields(await pdf.save({ updateFieldAppearances: false }), { name: "x" }, fonts, { flatten: true });
  expect(await listFields(out)).toEqual([]);
});

test("a text field's MaxLen is listed and longer answers are cut to it", async () => {
  const pdf = await PDFDocument.load(await form());
  pdf.getForm().getTextField("name").setMaxLength(5);
  const bytes = await pdf.save();
  expect((await listFields(bytes)).find((f) => f.name === "name")?.maxLength).toBe(5);
  const out = await fillFields(bytes, { name: "abcdefgh" }, fonts, { flatten: false });
  expect((await listFields(out)).find((f) => f.name === "name")?.value).toBe("abcde");
});
