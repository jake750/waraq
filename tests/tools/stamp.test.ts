import { PDFDocument } from "pdf-lib";
import { numberPages, pageLabel, stripMetadata } from "../../src/tools/stamp";
import { openPdf } from "../../src/pdf/openPdf";
import { pageText } from "../../src/text/search";

async function blank(pages: number, meta = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([400, 600]);
  if (meta) {
    pdf.setTitle("Secret plan");
    pdf.setAuthor("Someone");
    pdf.setKeywords(["x"]);
  }
  return pdf.save();
}

test("labels: plain, n of total, skipping the cover", () => {
  const o = { pos: "center" as const, start: 1, skipFirst: false, format: "n" as const };
  expect([0, 1, 2].map((i) => pageLabel(i, 3, o))).toEqual(["1", "2", "3"]);
  expect(pageLabel(1, 3, { ...o, format: "n-of" })).toBe("2 / 3");
  expect([0, 1, 2].map((i) => pageLabel(i, 3, { ...o, skipFirst: true }))).toEqual([null, "1", "2"]);
  expect(pageLabel(0, 3, { ...o, start: 5 })).toBe("5");
});

test("page numbers end up as text on each page", async () => {
  const out = await numberPages(await blank(3), { pos: "outer", start: 1, skipFirst: false, format: "n-of" });
  const doc = await openPdf(out);
  expect(doc.numPages).toBe(3);
  // pageText may order the runs either way round; what matters is both numbers are on the page.
  for (let p = 0; p < 3; p++) expect((await pageText(doc, p)).match(/\d+/g)?.sort()).toEqual([String(p + 1), "3"].sort());
});

test("metadata is removed and pages are kept", async () => {
  const out = await stripMetadata(await blank(2, true));
  const doc = await PDFDocument.load(out, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getTitle()).toBeUndefined();
  expect(doc.getAuthor()).toBeUndefined();
  expect(doc.getKeywords()).toBeUndefined();
  expect(doc.getProducer()).toBeUndefined();
});
