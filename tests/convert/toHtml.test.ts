// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toHtml } from "../../src/convert/toHtml";
import { ConvertError } from "../../src/convert/errors";

const office = (n: string) => new Uint8Array(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "office", n)));
const AR_HEAD = "تقرير الربع الأول";
const AR1 = "هذا تقرير تجريبي مكتوب لاختبار تحويل المستندات العربية.";
const text = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").normalize("NFC");
};

test("docx: heading, Arabic paragraph, table", async () => {
  const { body } = await toHtml(office("sample.docx"), "docx");
  expect(text(body)).toContain(AR_HEAD);
  expect(text(body)).toContain(AR1);
  expect(body).toMatch(/<h1/);
  const d = document.createElement("div");
  d.innerHTML = body;
  expect(d.querySelectorAll("td").length).toBe(9);
});

test("odt: heading, paragraph, bold, list, table", async () => {
  const { body } = await toHtml(office("sample.odt"), "odt");
  expect(text(body)).toContain(AR1);
  expect(body).toMatch(/<h1[^>]*>تقرير الربع الأول<\/h1>/);
  expect(body).toMatch(/<(b|strong)>word<\/(b|strong)>/);
  expect(body).toMatch(/<li[ >]/);
  const d = document.createElement("div");
  d.innerHTML = body;
  expect(d.querySelectorAll("td").length).toBe(9);
});

test("rtf: cp1256 bytes and \\u escapes both decode", async () => {
  const { body } = await toHtml(office("sample.rtf"), "rtf");
  expect(text(body)).toContain("تقرير");
  expect(text(body)).toContain(AR1);
  expect(text(body)).toContain("English line with a");
  expect(text(body)).not.toMatch(/Arial|generator/);
});

test("epub: chapters in spine order, scripts removed, title", async () => {
  const { title, body } = await toHtml(office("sample.epub"), "epub");
  expect(title).toBe("كتاب تجريبي");
  const t = text(body);
  expect(t.indexOf("الفصل الأول")).toBeLessThan(t.indexOf("الفصل الثاني"));
  expect(body).not.toMatch(/<script/i);
});

test("markdown → headings, table", async () => {
  const { body } = await toHtml(office("sample.md"), "md");
  expect(body).toMatch(/<h1[^>]*>تقرير الربع الأول<\/h1>/);
  expect(body).toMatch(/<table/);
});

test("txt: paragraphs and line breaks; windows-1256 fallback", async () => {
  const { body } = await toHtml(office("sample.txt"), "txt");
  expect(body.match(/<p/g)?.length).toBe(3);
  expect(body).toMatch(/<br/);
  const legacy = await toHtml(office("sample-1256.txt"), "txt");
  expect(text(legacy.body)).toContain(AR_HEAD);
});

test("html is sanitized: no scripts, handlers, javascript: links or remote images", async () => {
  const { title, body } = await toHtml(office("sample.html"), "html");
  expect(title).toBe(AR_HEAD);
  expect(body).not.toMatch(/<script|onclick|javascript:|example\.com/i);
  expect(text(body)).toContain(AR1);
});

test("a corrupt docx is a bad-input error", async () => {
  await expect(toHtml(new Uint8Array([1, 2, 3]), "docx")).rejects.toBeInstanceOf(ConvertError);
  await expect(toHtml(new Uint8Array([1, 2, 3]), "epub")).rejects.toMatchObject({ code: "bad-input" });
});
