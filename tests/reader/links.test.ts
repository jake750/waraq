import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { openPdf } from "../../src/pdf/openPdf";
import { pageLinks, safeUrl } from "../../src/reader/links";

test("only web and mail links can leave the app", () => {
  expect(safeUrl("https://example.org/a b")).toBe("https://example.org/a%20b");
  expect(safeUrl("mailto:someone@example.org")).toBe("mailto:someone@example.org");
  expect(safeUrl("javascript:alert(1)")).toBe(null);
  expect(safeUrl("file:///C:/Windows/system32/calc.exe")).toBe(null);
  expect(safeUrl("not a url")).toBe(null);
  expect(safeUrl(undefined)).toBe(null);
});

test("web links and links to pages are found; script links are not", async () => {
  const pdf = await PDFDocument.create();
  const p1 = pdf.addPage([300, 300]);
  const p2 = pdf.addPage([300, 300]);
  const link = (rect: number[], action: Record<string, unknown>) =>
    pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0], A: action } as never));
  p1.node.set(
    PDFName.of("Annots"),
    pdf.context.obj([
      link([10, 10, 100, 30], { S: "URI", URI: PDFString.of("https://example.org/") }),
      link([10, 50, 100, 70], { S: "GoTo", D: [p2.ref, PDFName.of("Fit")] }),
      link([10, 90, 100, 110], { S: "URI", URI: PDFString.of("javascript:alert(1)") }),
    ]),
  );
  const doc = await openPdf(await pdf.save());
  const links = await pageLinks(doc, await doc.getPage(1));
  expect(links.find((l) => l.url)?.url).toBe("https://example.org/");
  expect(links.find((l) => l.page)?.page).toBe(2);
  expect(links).toHaveLength(2);
});
