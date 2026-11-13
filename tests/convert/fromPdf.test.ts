// @vitest-environment happy-dom
import mammoth from "mammoth";
import { openPdf } from "../../src/pdf/openPdf";
import { linesOf, paragraphsOf, pdfToDocx, pdfToMarkdown, pdfToText } from "../../src/convert/fromPdf";
import { fx } from "../helpers";

const P1 = "الْكِتَابُ صَدِيقٌ لَا يَمَلُّ، يَفْتَحُ لَكَ أَبْوَابَهُ كُلَّمَا عُدْتَ إِلَيْهِ، وَيَحْفَظُ لَكَ مَا نَسِيتَ.".normalize("NFC");

test("lines carry size and baseline; page numbers are dropped", () => {
  // two body lines (size 12) close together, a gap, a heading (size 20), a lone page number
  const layout = {
    text: "عنوان\nسطر أول\nسطر ثان\n7",
    boxes: [
      ...Array(5).fill({ x: 0, y: 700 - 0.22 * 20, w: 10, h: 22 }),
      { x: 0, y: 0, w: 0, h: 0 },
      ...Array(7).fill({ x: 0, y: 650 - 0.22 * 12, w: 6, h: 13.2 }),
      { x: 0, y: 0, w: 0, h: 0 },
      ...Array(7).fill({ x: 0, y: 634 - 0.22 * 12, w: 6, h: 13.2 }),
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 40 - 0.22 * 12, w: 6, h: 13.2 },
    ],
  };
  const lines = linesOf(layout);
  expect(lines.map((l) => l.text)).toEqual(["عنوان", "سطر أول", "سطر ثان"]);
  expect(lines[0].size).toBeCloseTo(20, 0);
  expect(lines[1].baseline).toBeCloseTo(650, 0);
  const paras = paragraphsOf(lines, 12);
  expect(paras).toEqual([
    { text: "عنوان", heading: true, rtl: true },
    { text: "سطر أول سطر ثان", heading: false, rtl: true },
  ]);
});

test("Arabic book → text in reading order with the vowelled sentence", async () => {
  const doc = await openPdf(fx("arabic-book.pdf"));
  const t = await pdfToText(doc);
  expect(t.normalize("NFC")).toContain(P1);
  expect(t).toMatch(/الفصل الأول/);
});

test("Arabic book → Markdown with chapter headings", async () => {
  const md = await pdfToMarkdown(await openPdf(fx("arabic-book.pdf")));
  expect(md).toMatch(/^# الفصل الأول$/m);
});

test("PDF → DOCX reopens with Arabic text", async () => {
  const bytes = await pdfToDocx(await openPdf(fx("arabic-book.pdf")));
  const back = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer, buffer: bytes } as never);
  expect(back.value.normalize("NFC")).toContain(P1);
});

test("English two-column text is extracted", async () => {
  expect(await pdfToText(await openPdf(fx("english-two-column.pdf")))).toMatch(/lighthouse/);
});
