// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";
import { toHtml } from "../../src/convert/toHtml";
import { htmlDocument, htmlToDocx, htmlToMarkdown, htmlToText } from "../../src/convert/fromHtml";

const office = (n: string) => new Uint8Array(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "office", n)));
const AR1 = "هذا تقرير تجريبي مكتوب لاختبار تحويل المستندات العربية.";

test("text keeps paragraphs and table cells apart", async () => {
  const { body } = await toHtml(office("sample.docx"), "docx");
  const t = htmlToText(body);
  expect(t).toContain(AR1);
  expect(t).toMatch(/تقرير الربع الأول\n/);
  expect(t).toMatch(/البند\tالكمية\tالسعر/);
  expect(t).not.toMatch(/\n{3,}/);
});

test("markdown has a heading and a GFM table", async () => {
  const { body } = await toHtml(office("sample.docx"), "docx");
  const md = htmlToMarkdown(body);
  expect(md).toMatch(/^# تقرير الربع الأول/m);
  expect(md).toMatch(/\| *البند *\| *الكمية *\| *السعر *\|/);
  expect(md).toMatch(/\|\s*-{3,}/);
});

test("a full HTML page is printable and RTL-aware", () => {
  const page = htmlDocument("عنوان", `<p dir="auto">${AR1}</p>`, { size: "A4", landscape: false, marginMm: 20 });
  expect(page).toMatch(/<meta charset="utf-8">/i);
  expect(page).toMatch(/@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*20mm/);
  expect(page).toMatch(/Traditional Arabic/);
  expect(page).toContain("<title>عنوان</title>");
  expect(page).not.toMatch(/<script/i);
});

test("docx output reopens with the Arabic text and RTL paragraphs", async () => {
  const { body } = await toHtml(office("sample.md"), "md");
  const bytes = await htmlToDocx("t", body);
  const back = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer, buffer: bytes } as never);
  expect(back.value).toContain(AR1);
  expect(back.value).toMatch(/<table>/);
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
  expect(xml).toMatch(/<w:bidi\/>/);
  expect(xml).toMatch(/<w:rtl\/>/);
});
