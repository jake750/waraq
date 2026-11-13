import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { jpegOrientation, orientMatrix } from "../../src/convert/exif";
import { imagesToPdf } from "../../src/convert/imagesToPdf";
import { withOrientation } from "../helpers";

const jpg = new Uint8Array(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "office", "sample.jpg")));

test("reads the EXIF orientation, either byte order; 1 when there is none", () => {
  expect(jpegOrientation(withOrientation(6))).toBe(6);
  expect(jpegOrientation(withOrientation(8, true))).toBe(8);
  expect(jpegOrientation(jpg)).toBe(1);
  expect(jpegOrientation(new Uint8Array([0x89, 0x50]))).toBe(1);
});

test("orientation 6 (rotate clockwise) maps the image's top-left corner to the box's top-right", () => {
  const [a, b, c, d, e, f] = orientMatrix(6, 10, 20, 100, 50);
  const at = (u: number, v: number) => [a * u + c * v + e, b * u + d * v + f];
  expect(at(0, 1)).toEqual([110, 70]); // stored top-left → displayed top-right
  expect(at(1, 1)).toEqual([110, 20]); // stored top-right → displayed bottom-right
  expect(orientMatrix(1, 10, 20, 100, 50)).toEqual([100, 0, 0, 50, 10, 20]);
});

test("a portrait phone photo stored sideways becomes a portrait page", async () => {
  const opts = { size: "A4", landscape: false, marginMm: 0, fit: "image" } as const;
  const plain = (await PDFDocument.load(await imagesToPdf([{ bytes: jpg, fmt: "jpg" }], opts))).getPage(0).getSize();
  const turned = (await PDFDocument.load(await imagesToPdf([{ bytes: withOrientation(6), fmt: "jpg" }], opts))).getPage(0).getSize();
  expect(turned.width).toBeCloseTo(plain.height);
  expect(turned.height).toBeCloseTo(plain.width);
});
