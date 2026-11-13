import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { imagesToPdf } from "../../src/convert/imagesToPdf";

const office = (n: string) => new Uint8Array(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "office", n)));

test("two images become two pages", async () => {
  const out = await imagesToPdf(
    [
      { bytes: office("sample.png"), fmt: "png" },
      { bytes: office("sample.jpg"), fmt: "jpg" },
    ],
    { size: "A4", landscape: false, marginMm: 10, fit: "page" },
  );
  const doc = await PDFDocument.load(out);
  expect(doc.getPageCount()).toBe(2);
  const { width, height } = doc.getPage(0).getSize();
  expect(Math.round(width)).toBe(595);
  expect(Math.round(height)).toBe(842);
});

test("fit to image: the page is the image size (96 dpi → pt)", async () => {
  const out = await imagesToPdf([{ bytes: office("sample.png"), fmt: "png" }], { size: "A4", landscape: false, marginMm: 0, fit: "image" });
  const { width, height } = (await PDFDocument.load(out)).getPage(0).getSize();
  expect(Math.round(width)).toBe(300); // 400 px × 0.75
  expect(Math.round(height)).toBe(225);
});

test("landscape A4", async () => {
  const out = await imagesToPdf([{ bytes: office("sample.jpg"), fmt: "jpg" }], { size: "A4", landscape: true, marginMm: 10, fit: "page" });
  const { width } = (await PDFDocument.load(out)).getPage(0).getSize();
  expect(Math.round(width)).toBe(842);
});
