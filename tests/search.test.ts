import { openPdf } from "../src/pdf/openPdf";
import { buildPageText, findMatches, pageText, type GlyphItem } from "../src/text/search";
import { fx, readFixtureText } from "./helpers";

const L = { loose: true, caseSensitive: false };
const S = { loose: false, caseSensitive: false };

test("loose maps back to original offsets", () =>
  expect(findMatches(["قال الْكِتَابُ مفيد"], "الكتاب", L)).toEqual([{ page: 0, start: 4, end: 14 }]));

test("strict needs the vowels", () => expect(findMatches(["قال الْكِتَابُ مفيد"], "الكتاب", S)).toEqual([]));

test("case-insensitive english, all pages", () =>
  expect(findMatches(["a Lighthouse", "x", "lighthouse lighthouse"], "LIGHTHOUSE", S)).toEqual([
    { page: 0, start: 2, end: 12 },
    { page: 2, start: 0, end: 10 },
    { page: 2, start: 11, end: 21 },
  ]));

test("empty query", () => expect(findMatches(["abc"], "  ", L)).toEqual([]));

// ---- line rebuilding from positioned glyphs (visual order → reading order) ----

const item = (str: string, x: number, w: number, y = 700, dir = "ltr"): GlyphItem => ({
  str,
  dir,
  width: w,
  height: 12,
  hasEOL: false,
  transform: [12, 0, 0, 12, x, y],
});

test("arabic word drawn in visual order", () =>
  expect(buildPageText([item("باتك", 0, 40)])).toBe("كتاب"));

test("pdf.js rtl items are already logical", () =>
  expect(buildPageText([item("كتاب", 0, 40, 700, "rtl")])).toBe("كتاب"));

test("marks attach to their letter by position", () =>
  expect(
    buildPageText([
      item("ب", 0, 10),
      item("َ", 4, 0),
      item("ت", 10, 10),
      item("َ", 14, 0),
      item("ك", 20, 10),
      item("َ", 24, 0),
    ]),
  ).toBe("كَتَبَ"));

test("english inside arabic keeps its order", () =>
  expect(
    buildPageText([item("ديدج", 0, 40), item(" ", 40, 10), item("PDF", 50, 30), item(" ", 80, 10), item("فلم", 90, 30)]),
  ).toBe("ملف PDF جديد"));

test("presentation forms become normal letters", () =>
  expect(buildPageText([item("ﻻ", 0, 10), item(" ", 10, 4), item("ﺎﺘﻜ", 14, 30)])).toBe("كتا لا"));

test("lines by baseline, null glyphs dropped", () =>
  expect(buildPageText([item("World", 0, 50, 680), item("Hel\u0000lo", 0, 50, 700)])).toBe("Hello\nWorld"));

test("english text stays as is", () =>
  expect(buildPageText([item("The", 0, 30), item(" ", 30, 5), item("sea", 35, 30)])).toBe("The sea"));

// ---- real fixtures ----

test("arabic fixture page 1 text matches its source", async () => {
  const doc = await openPdf(fx("arabic-book.pdf"));
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  expect(flat(await pageText(doc, 0))).toContain(flat(readFixtureText("arabic-book.source.txt").split("\n")[0]));
});

test("english fixture: 3 hits on 3 pages", async () => {
  const doc = await openPdf(fx("english-two-column.pdf"));
  const pages = await Promise.all([0, 1, 2].map((i) => pageText(doc, i)));
  expect(findMatches(pages, "lighthouse", S).map((m) => m.page)).toEqual([0, 1, 2]);
});
