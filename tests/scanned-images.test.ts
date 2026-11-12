import { join } from "node:path";
import { OPS } from "pdfjs-dist";
import { openPdf, setPdfAssetBase } from "../src/pdf/openPdf";
import { fx } from "./helpers";

beforeAll(() => setPdfAssetBase(join(import.meta.dirname, "..", "node_modules", "pdfjs-dist") + "/"));

// Book scans are mostly JPEG 2000 / JBIG2 / CCITT, which pdf.js decodes with wasm modules.
test("a JPEG 2000 scan decodes (not a blank page)", async () => {
  const doc = await openPdf(fx("scanned-jpx.pdf"));
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  const at = ops.fnArray.indexOf(OPS.paintImageXObject);
  expect(at).toBeGreaterThanOrEqual(0);
  const img = await new Promise<{ width: number }>((r) => page.objs.get(ops.argsArray[at][0], r));
  expect(img.width).toBe(240);
});
