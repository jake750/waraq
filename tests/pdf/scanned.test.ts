import { openPdf } from "../../src/pdf/openPdf";
import { looksScanned } from "../../src/pdf/scanned";
import { fx } from "../helpers";

test("a scan has no text; a typed book has", async () => {
  expect(await looksScanned(await openPdf(fx("scanned.pdf")))).toBe(true);
  expect(await looksScanned(await openPdf(fx("arabic-book.pdf")))).toBe(false);
});
