import { join } from "node:path";
import { OPS } from "pdfjs-dist";
import { openPdf, setPdfAssetBase } from "../src/pdf/openPdf";
import { leasePage } from "../src/reader/pageLease";
import { canvasPixels, withPageSize } from "../src/reader/layout";
import { fx } from "./helpers";

beforeAll(() => setPdfAssetBase(join(import.meta.dirname, "..", "node_modules", "pdfjs-dist") + "/"));

test("releasing a page frees its decoded images", async () => {
  const doc = await openPdf(fx("scanned-jpx.pdf"));
  const lease = await leasePage(doc, 1);
  const ops = await lease.page.getOperatorList();
  const id = ops.argsArray[ops.fnArray.indexOf(OPS.paintImageXObject)][0];
  await new Promise((r) => lease.page.objs.get(id, r));
  expect(lease.page.objs.has(id)).toBe(true);
  lease.release();
  await new Promise((r) => setTimeout(r, 50));
  expect(lease.page.objs.has(id)).toBe(false);
});

test("canvas keeps the device ratio when small", () => {
  expect(canvasPixels(600, 800, 2, 16e6)).toEqual({ w: 1200, h: 1600, ratio: 2 });
});

test("canvas is capped to the pixel budget at high zoom", () => {
  const c = canvasPixels(2975, 4210, 2, 16e6);
  expect(c.w * c.h).toBeLessThanOrEqual(16e6);
  expect(c.w / c.h).toBeCloseTo(2975 / 4210, 2);
});

test("a landscape page gets its own size", () => {
  const sizes = [{ w: 595, h: 842 }, { w: 595, h: 842 }];
  const next = withPageSize(sizes, 1, { w: 842, h: 595 });
  expect(next[1]).toEqual({ w: 842, h: 595 });
  expect(next[0]).toEqual({ w: 595, h: 842 });
});

test("an unchanged size keeps the same array (no re-render loop)", () => {
  const sizes = [{ w: 595, h: 842 }];
  expect(withPageSize(sizes, 0, { w: 595, h: 842 })).toBe(sizes);
});

test("page numbers typed in Arabic-Indic or Persian digits", async () => {
  const { parsePageNumber } = await import("../src/reader/layout");
  expect(parsePageNumber("١٢")).toBe(12);
  expect(parsePageNumber("۱۲")).toBe(12);
  expect(parsePageNumber("7")).toBe(7);
  expect(parsePageNumber("")).toBeNaN();
});
