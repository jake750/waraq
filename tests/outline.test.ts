import { openPdf } from "../src/pdf/openPdf";
import { flattenOutline } from "../src/reader/outline";
import { fx } from "./helpers";

test("arabic book outline", async () => {
  const items = await flattenOutline(await openPdf(fx("arabic-book.pdf")));
  expect(items.map((i) => i.title)).toEqual(["الفصل الأول", "الفصل الثاني", "الفصل الثالث", "الفصل الرابع"]);
  expect(items.every((i) => i.page >= 1 && i.page <= 12)).toBe(true);
  expect(items.map((i) => i.page)).toEqual([...items.map((i) => i.page)].sort((a, b) => a - b));
});

test("chapters land on their pages", async () => {
  const items = await flattenOutline(await openPdf(fx("arabic-book.pdf")));
  expect(items.map((i) => i.page)).toEqual([1, 4, 7, 10]);
});

test("no outline → empty", async () => expect(await flattenOutline(await openPdf(fx("scanned.pdf")))).toEqual([]));
