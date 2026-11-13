// Office/text/image fixtures for the converter (fixtures/office/). All text is original, written for this project.
// Usage: node scripts/make-office-fixtures.mjs   (ffmpeg on PATH for the images)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const out = resolve(import.meta.dirname, "..", "fixtures", "office");
mkdirSync(out, { recursive: true });
const w = (name, data) => writeFileSync(join(out, name), data);

export const AR_HEAD = "تقرير الربع الأول";
export const AR1 = "هذا تقرير تجريبي مكتوب لاختبار تحويل المستندات العربية.";
export const EN1 = "This paragraph mixes English with العربية in one line.";
const TABLE = [
  ["البند", "الكمية", "السعر"],
  ["ورق", "10", "50"],
  ["حبر", "2", "30"],
];

// ---- DOCX ------------------------------------------------------------------
const rtlPara = (text, extra = {}) =>
  new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, ...extra, children: [new TextRun({ text, rightToLeft: true })] });
const docx = new Document({
  sections: [
    {
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, bidirectional: true, children: [new TextRun({ text: AR_HEAD, rightToLeft: true })] }),
        rtlPara(AR1),
        new Paragraph({ children: [new TextRun("This paragraph mixes English with "), new TextRun({ text: "العربية", bold: true }), new TextRun(" in one line.")] }),
        new Paragraph({ text: "First point", bullet: { level: 0 } }),
        new Paragraph({ text: "Second point", bullet: { level: 0 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          visuallyRightToLeft: true,
          rows: TABLE.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [rtlPara(c)] })) })),
        }),
      ],
    },
  ],
});
w("sample.docx", await Packer.toBuffer(docx));

// ---- ODT -------------------------------------------------------------------
const odtContent = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
<office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>
<office:body><office:text>
<text:h text:outline-level="1">${AR_HEAD}</text:h>
<text:p>${AR1}</text:p>
<text:p>Bold <text:span text:style-name="T1">word</text:span><text:s/>here.</text:p>
<text:list><text:list-item><text:p>First point</text:p></text:list-item><text:list-item><text:p>Second point</text:p></text:list-item></text:list>
<table:table>${TABLE.map((r) => `<table:table-row>${r.map((c) => `<table:table-cell><text:p>${c}</text:p></table:table-cell>`).join("")}</table:table-row>`).join("")}</table:table>
</office:text></office:body></office:document-content>`;
const odt = new JSZip();
odt.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
odt.file("content.xml", odtContent);
odt.file(
  "META-INF/manifest.xml",
  `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`,
);
w("sample.odt", await odt.generateAsync({ type: "nodebuffer" }));

// ---- RTF: Arabic as cp1256 bytes (\'hh) and as \uN escapes -------------------
const cp1256 = { "ت": 0xca, "ق": 0xde, "ر": 0xd1, "ي": 0xed };
const hex = (s) => [...s].map((c) => `\\'${cp1256[c].toString(16)}`).join("");
const uesc = (s) => [...s].map((c) => `\\u${c.codePointAt(0)}?`).join("");
const rtf = `{\\rtf1\\ansi\\ansicpg1256\\deff0{\\fonttbl{\\f0\\fnil\\fcharset178 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}
{\\*\\generator hand;}\\rtlpar\\f0\\fs24 {\\b ${hex("تقرير")}}\\par
${uesc(AR1)}\\par
English line with a\\tab tab.\\par
}`;
w("sample.rtf", Buffer.from(rtf, "latin1"));

// ---- EPUB (manifest order differs from spine order on purpose) --------------
const ep = new JSZip();
ep.file("mimetype", "application/epub+zip", { compression: "STORE" });
ep.file(
  "META-INF/container.xml",
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
);
ep.file(
  "OEBPS/book.opf",
  `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>كتاب تجريبي</dc:title><dc:identifier id="id">waraq-fixture</dc:identifier><dc:language>ar</dc:language></metadata>
<manifest><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
);
const chap = (h, p) =>
  `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" dir="rtl"><head><title>${h}</title></head><body><h1>${h}</h1><p>${p}</p><script>alert(1)</script></body></html>`;
ep.file("OEBPS/text/ch1.xhtml", chap("الفصل الأول", AR1));
ep.file("OEBPS/text/ch2.xhtml", chap("الفصل الثاني", "نهاية الكتاب التجريبي."));
w("sample.epub", await ep.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" }));

// ---- Plain formats ------------------------------------------------------------
w("sample.md", `# ${AR_HEAD}\n\n${AR1}\n\n${EN1}\n\n- First point\n- Second point\n\n| ${TABLE[0].join(" | ")} |\n|---|---|---|\n${TABLE.slice(1).map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`);
w("sample.txt", `${AR_HEAD}\n\n${AR1}\nسطر ثانٍ في نفس الفقرة.\n\n${EN1}\n`);
w("sample-1256.txt", Buffer.from([...AR_HEAD].map((c) => ({ "ت": 0xca, "ق": 0xde, "ر": 0xd1, "ي": 0xed, " ": 0x20, "ا": 0xc7, "ل": 0xe1, "ع": 0xda, "أ": 0xc3, "و": 0xe6, "ب": 0xc8 })[c])));
w(
  "sample.html",
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${AR_HEAD}</title><script>alert(1)</script></head><body><h1 onclick="alert(2)">${AR_HEAD}</h1><p>${AR1}</p><p><a href="javascript:alert(3)">link</a> <img src="https://example.com/x.png"></p><table>${TABLE.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`,
);

// ---- Images ---------------------------------------------------------------------
for (const [name, args] of [
  ["sample.png", ["-frames:v", "1"]],
  ["sample.jpg", ["-frames:v", "1", "-q:v", "4"]],
  ["sample.webp", ["-frames:v", "1"]],
]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=400x300", ...args, join(out, name)]);
}
console.log("fixtures/office written");
