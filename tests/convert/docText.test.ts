import { readFileSync } from "node:fs";
import { docParagraphs, docRawText, docToHtml } from "../../src/convert/docText";

// sample.doc is sample.docx saved by LibreOffice as "MS Word 97" (see fixtures/README.md).
const doc = new Uint8Array(readFileSync("fixtures/office/sample.doc"));

test("reads the Arabic and English text of an old Word (.doc) file", () => {
  const paras = docParagraphs(docRawText(doc));
  expect(paras).toContain("تقرير الربع الأول");
  expect(paras).toContain("This paragraph mixes English with العربية in one line.");
  expect(paras).toContain("Second point");
});

test("tables become HTML tables, one row per line", () => {
  const { body } = docToHtml(doc);
  expect(body).toContain("<table>");
  expect(body).toContain('<tr><td dir="auto">ورق</td><td dir="auto">10</td><td dir="auto">50</td></tr>');
});

test("fields keep their result and drop their code", () => {
  expect(docParagraphs("Page \x13 PAGE \x141\x15 end\rnext")).toEqual(["Page 1 end", "next"]);
});

test("a file that isn't a Word document is refused as bad input", () => {
  expect(() => docRawText(new Uint8Array(readFileSync("fixtures/office/sample.docx")))).toThrow(expect.objectContaining({ code: "bad-input" }));
});
