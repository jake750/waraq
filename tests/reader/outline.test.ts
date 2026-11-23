import { PDFDocument, StandardFonts } from "pdf-lib";
import { openPdf } from "../../src/pdf/openPdf";
import { headingOutline, headingsFromLayouts } from "../../src/reader/outline";
import type { PageLayout } from "../../src/text/search";

/** A page layout from lines of [text, font size], top to bottom. */
function page(lines: [string, number][]): PageLayout {
  let text = "";
  const boxes: PageLayout["boxes"] = [];
  let y = 800;
  for (const [t, size] of lines) {
    if (text) {
      text += "\n";
      boxes.push({ x: 0, y, w: 0, h: size * 1.1 });
    }
    y -= size * 1.5;
    for (let i = 0; i < t.length; i++) boxes.push({ x: i * size * 0.5, y, w: size * 0.5, h: size * 1.1 });
    text += t;
  }
  return { text, boxes };
}

const body = "Body text that runs on for a while, as paragraphs do in a book.";

test("headings are lines clearly larger than the body, with levels by size", () => {
  const out = headingsFromLayouts([
    page([["Part One", 24], ["Chapter 1", 18], [body, 11], [body, 11]]),
    page([[body, 11], ["Chapter 2", 18], [body, 11], ["12", 18]]),
  ]);
  expect(out).toEqual([
    { title: "Part One", page: 1, depth: 0 },
    { title: "Chapter 1", page: 1, depth: 1 },
    { title: "Chapter 2", page: 2, depth: 1 },
  ]);
});

test("a heading that wraps is one entry; Arabic headings work the same", () => {
  const out = headingsFromLayouts([page([["الفصل الأول:", 20], ["البداية", 20], [body, 11], [body, 11]])]);
  expect(out).toEqual([{ title: "الفصل الأول: البداية", page: 1, depth: 0 }]);
});

test("running heads repeated on many pages, and documents without bigger text, give nothing", () => {
  const pages = Array.from({ length: 5 }, () => page([["Annual Report", 16], [body, 11], [body, 11]]));
  expect(headingsFromLayouts(pages)).toEqual([]);
  expect(headingsFromLayouts([page([[body, 11], [body, 11]])])).toEqual([]);
  expect(headingsFromLayouts([{ text: "", boxes: [] }])).toEqual([]);
});

test("headingOutline reads a real PDF", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const title of ["Introduction", "Methods"]) {
    const p = pdf.addPage([400, 400]);
    p.drawText(title, { x: 20, y: 350, size: 22, font });
    for (let i = 0; i < 6; i++) p.drawText("Ordinary text of the page body " + i, { x: 20, y: 300 - i * 16, size: 11, font });
  }
  const doc = await openPdf(await pdf.save());
  expect(await headingOutline(doc)).toEqual([
    { title: "Introduction", page: 1, depth: 0 },
    { title: "Methods", page: 2, depth: 0 },
  ]);
});

test("headingOutline stops reading pages once it is no longer wanted", async () => {
  const doc = { numPages: 50 } as never;
  let reads = 0;
  let wanted = true;
  const read = async () => {
    if (++reads === 3) wanted = false;
    return { text: "", boxes: [] };
  };
  await expect(headingOutline(doc, read, () => wanted)).rejects.toThrow("cancelled");
  expect(reads).toBe(3);
});
