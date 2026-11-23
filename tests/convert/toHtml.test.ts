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

test("tables and lists take the direction of their text", async () => {
  const { sanitizeFragment } = await import("../../src/convert/sanitize");
  const out = sanitizeFragment("<table><tr><td>البند</td><td>10</td></tr></table><ul><li>First</li></ul><ol><li>أول</li></ol>");
  expect(out).toMatch(/<table dir="rtl"/);
  expect(out).toMatch(/<ul dir="ltr"/);
  expect(out).toMatch(/<ol dir="rtl"/);
});

test("nothing in the sanitized html can fetch from the network", async () => {
  const { sanitizeFragment } = await import("../../src/convert/sanitize");
  const out = sanitizeFragment(
    `<table background="http://x.test/a.png"><tr><td>a</td></tr></table>` +
      `<video poster="https://x.test/p.jpg"></video>` +
      `<svg><image href="https://x.test/i.png"/><use xlink:href="http://x.test/s.svg#a"/></svg>` +
      `<a href="https://keep.test/page">link</a>`,
  );
  expect(out).not.toMatch(/x\.test/);
  expect(out).toContain("https://keep.test/page"); // a link loads nothing until someone follows it
});

test("svg animations and escaped css can't sneak code or fetches through", async () => {
  const { sanitizeFragment } = await import("../../src/convert/sanitize");
  const out = sanitizeFragment(
    '<svg><a><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="href" to="javascript:x"/><text>t</text></a></svg>' +
      String.raw`<p style="background:u\72l(http://x/a.png)">a</p>` +
        `<p style="background-image:image-set('http://x/b.png' 1x)">b</p><p style="color:red">c</p>`,
  );
  expect(out).not.toMatch(/animate|<set|javascript/i);
  expect(out).not.toMatch(/72l|image-set|http:/);
  expect(out).toContain('style="color:red"');
});

test("a zip that would unpack to too much is refused before unpacking", async () => {
  const { loadZip } = await import("../../src/convert/zipGuard");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("content.xml", "x".repeat(200_000)); // compresses to almost nothing
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await expect(loadZip(bytes, 100_000)).rejects.toMatchObject({ code: "too-large" });
  await expect(loadZip(bytes, 1_000_000)).resolves.toBeTruthy();
  await expect(loadZip(office("sample.docx"))).resolves.toBeTruthy();
});

test("odt space runs are bounded", async () => {
  const { spaceCount } = await import("../../src/convert/odt");
  expect(spaceCount(null)).toBe(1);
  expect(spaceCount("3")).toBe(3);
  expect(spaceCount("1e9")).toBe(100);
  expect(spaceCount("-5")).toBe(0);
  expect(spaceCount("abc")).toBe(1);
});
